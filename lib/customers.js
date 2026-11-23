// Customer accounts.
//
// A customer is a row in the existing `users` table with role 'customer',
// linked to the project (the original lead / payment / website record) through
// project_members. Nothing is duplicated: one identity, one project, one site.
//
// Accounts are created by invitation only (after a purchase, or by a studio
// admin). The invite link lets the customer choose their own password; the
// platform never knows or sends a password.
import bcrypt from 'bcryptjs';
import { sql, initDb, getProject, patchProject, getSettings } from './db.js';
import { newId, hashPassword } from './auth.js';
import { sha256, randomToken } from './crypto.js';
import { customerInvite, customerAccessAdded, passwordReset } from './email.js';

const INVITE_TTL = 7 * 24 * 60 * 60 * 1000;
const RESET_TTL = 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Use at least 10 characters.';
  if (pw.length > 200) return 'That password is too long.';
  if (/^(.)\1+$/.test(pw) || ['password123', '1234567890', 'qwertyuiop'].includes(pw.toLowerCase())) return 'Please choose a less guessable password.';
  return null;
}

async function issueToken(userId, purpose, ttl) {
  // One live link per purpose: a new one replaces any earlier ones.
  await sql`DELETE FROM auth_tokens WHERE user_id = ${userId} AND purpose = ${purpose}`;
  const token = randomToken(32);
  const now = Date.now();
  await sql`INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at, created_at) VALUES (${sha256(token)}, ${userId}, ${purpose}, ${now + ttl}, ${now})`;
  return token;
}

async function readToken(token, purpose) {
  if (!token || typeof token !== 'string' || token.length < 20) return null;
  const rows = await sql`SELECT t.user_id, t.expires_at, t.used_at, u.email, u.full_name, u.role, u.activated_at
                         FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ${sha256(token)} AND t.purpose = ${purpose}`;
  const r = rows[0];
  if (!r || r.used_at || Number(r.expires_at) < Date.now()) return null;
  return r;
}

async function uniqueUsername(email) {
  const base = (email.split('@')[0] || 'customer').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'customer';
  for (let i = 0; i < 20; i++) {
    const name = i === 0 ? base : base + Math.floor(100 + Math.random() * 9000);
    const rows = await sql`SELECT 1 FROM users WHERE username = ${name}`;
    if (!rows.length) return name;
  }
  return base + Date.now().toString(36);
}

/**
 * Give a person access to a project's website and send them the link.
 * Idempotent: inviting the same address again refreshes and resends the link.
 * @returns {{ userId, link, emailed, existing }}
 */
export async function inviteCustomer(projectId, { email, role = 'owner', origin = '', send = true } = {}) {
  await initDb();
  const addr = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(addr)) throw { status: 400, message: 'Enter a valid email address.' };
  const project = await getProject(projectId);
  if (!project) throw { status: 404, message: 'Project not found' };
  if (!['owner', 'editor'].includes(role)) role = 'owner';

  let user = (await sql`SELECT id, role, activated_at, full_name FROM users WHERE email = ${addr}`)[0];
  if (user && user.role !== 'customer') throw { status: 409, message: 'That email belongs to a studio team member. Use a different address for the customer.' };
  const now = Date.now();
  if (!user) {
    const id = newId('c');
    // An unguessable placeholder; the customer sets the real password from the invite link.
    const placeholder = await bcrypt.hash(randomToken(32), 8);
    await sql`INSERT INTO users (id, full_name, email, username, password, role, created_at)
              VALUES (${id}, '', ${addr}, ${await uniqueUsername(addr)}, ${placeholder}, 'customer', ${now})`;
    user = { id, role: 'customer', activated_at: null };
  }
  const existingMember = (await sql`SELECT role FROM project_members WHERE user_id = ${user.id} AND project_id = ${projectId}`)[0];
  // The first person on a project is always the owner.
  const owners = await sql`SELECT COUNT(*)::int AS n FROM project_members WHERE project_id = ${projectId} AND role = 'owner'`;
  const finalRole = owners[0].n === 0 ? 'owner' : (existingMember?.role || role);
  await sql`INSERT INTO project_members (user_id, project_id, role, created_at) VALUES (${user.id}, ${projectId}, ${finalRole}, ${now})
            ON CONFLICT (user_id, project_id) DO NOTHING`;

  let link, emailed = false;
  if (user.activated_at) {
    link = `${origin}/login`;
    if (send && !existingMember) { const r = await customerAccessAdded(addr, project.business?.name, link).catch(() => null); emailed = !!r?.ok; }
  } else {
    const token = await issueToken(user.id, 'invite', INVITE_TTL);
    link = `${origin}/welcome/${token}`;
    if (send) { const r = await customerInvite(addr, project.business?.name, link).catch(() => null); emailed = !!r?.ok; }
  }
  if (finalRole === 'owner') {
    await patchProject(projectId, { customer: { userId: user.id, email: addr, invitedAt: project.customer?.userId === user.id ? (project.customer.invitedAt || now) : now, acceptedAt: user.activated_at ? Number(user.activated_at) : (project.customer?.userId === user.id ? project.customer.acceptedAt || null : null) } });
  }
  return { userId: user.id, link, emailed, existing: !!existingMember, role: finalRole };
}

/** Called after a successful payment. Never throws: a purchase must not fail on this. */
export async function inviteAfterPurchase(projectId, origin) {
  try {
    const settings = await getSettings();
    if (settings.customerAutoInvite === false) return null;
    const project = await getProject(projectId);
    const email = project?.payment?.email || project?.business?.email;
    if (!email) return null;
    if (project.customer?.userId) return null; // already invited
    return await inviteCustomer(projectId, { email, role: 'owner', origin });
  } catch { return null; }
}

export async function inviteInfo(token) {
  await initDb();
  const r = await readToken(token, 'invite');
  if (!r || r.role !== 'customer') return null;
  const projects = await sql`SELECT p.data->'business'->>'name' AS name FROM project_members m JOIN projects p ON p.id = m.project_id WHERE m.user_id = ${r.user_id} LIMIT 1`;
  return { email: r.email, businessName: projects[0]?.name || '' };
}

/** Customer sets their password from an invite or reset link. Returns the user id. */
export async function redeemToken(token, purpose, { password, fullName } = {}) {
  await initDb();
  const r = await readToken(token, purpose);
  if (!r || r.role !== 'customer') throw { status: 400, message: 'This link has expired or was already used. Ask for a new one.' };
  const bad = validPassword(password);
  if (bad) throw { status: 400, message: bad };
  const now = Date.now();
  const hash = await hashPassword(password);
  // Single use: only the first request to flip used_at wins.
  const used = await sql`UPDATE auth_tokens SET used_at = ${now} WHERE token_hash = ${sha256(token)} AND used_at IS NULL RETURNING user_id`;
  if (!used.length) throw { status: 400, message: 'This link was already used.' };
  if (purpose === 'invite') {
    await sql`UPDATE users SET password = ${hash}, activated_at = COALESCE(activated_at, ${now}), full_name = CASE WHEN ${String(fullName || '').slice(0, 120)} <> '' THEN ${String(fullName || '').slice(0, 120)} ELSE full_name END WHERE id = ${r.user_id}`;
  } else {
    await sql`UPDATE users SET password = ${hash}, activated_at = COALESCE(activated_at, ${now}) WHERE id = ${r.user_id}`;
  }
  // The used link and any other outstanding links for this account are removed.
  await sql`DELETE FROM auth_tokens WHERE user_id = ${r.user_id}`;
  const projects = await sql`SELECT project_id FROM project_members WHERE user_id = ${r.user_id} AND role = 'owner'`;
  for (const p of projects) {
    const proj = await getProject(p.project_id);
    if (proj?.customer?.userId === r.user_id && !proj.customer.acceptedAt) await patchProject(p.project_id, { customer: { ...proj.customer, acceptedAt: now } });
  }
  return r.user_id;
}

/** Always resolves the same way, whether or not the address has an account. */
export async function requestPasswordReset(email, origin) {
  await initDb();
  const addr = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(addr)) return;
  const user = (await sql`SELECT id, role, activated_at FROM users WHERE email = ${addr}`)[0];
  if (!user || user.role !== 'customer') return;
  if (!user.activated_at) {
    // Never finished the invite: send a fresh invite instead.
    const token = await issueToken(user.id, 'invite', INVITE_TTL);
    const p = await sql`SELECT p.data->'business'->>'name' AS name FROM project_members m JOIN projects p ON p.id = m.project_id WHERE m.user_id = ${user.id} LIMIT 1`;
    await customerInvite(addr, p[0]?.name || '', `${origin}/welcome/${token}`).catch(() => {});
    return;
  }
  const token = await issueToken(user.id, 'reset', RESET_TTL);
  await passwordReset(addr, `${origin}/reset/${token}`).catch(() => {});
}

/** Staff: a fresh invite or reset link for an existing member. */
export async function resendAccess(projectId, userId, origin, { send = true } = {}) {
  await initDb();
  const rows = await sql`SELECT u.id, u.email, u.activated_at FROM project_members m JOIN users u ON u.id = m.user_id WHERE m.project_id = ${projectId} AND m.user_id = ${userId}`;
  const u = rows[0];
  if (!u) throw { status: 404, message: 'That person does not have access to this website.' };
  const project = await getProject(projectId);
  if (u.activated_at) {
    const token = await issueToken(u.id, 'reset', RESET_TTL);
    const link = `${origin}/reset/${token}`;
    const r = send ? await passwordReset(u.email, link).catch(() => null) : null;
    return { link, emailed: !!r?.ok };
  }
  const token = await issueToken(u.id, 'invite', INVITE_TTL);
  const link = `${origin}/welcome/${token}`;
  const r = send ? await customerInvite(u.email, project?.business?.name, link).catch(() => null) : null;
  return { link, emailed: !!r?.ok };
}

export async function listMembers(projectId) {
  await initDb();
  const rows = await sql`SELECT u.id, u.email, u.full_name, u.activated_at, u.last_login_at, m.role, m.created_at
                         FROM project_members m JOIN users u ON u.id = m.user_id WHERE m.project_id = ${projectId} ORDER BY m.created_at`;
  return rows.map(r => ({ userId: r.id, email: r.email, name: r.full_name, role: r.role, active: !!r.activated_at, invitedAt: Number(r.created_at), lastLoginAt: r.last_login_at ? Number(r.last_login_at) : null }));
}

export async function revokeMember(projectId, userId) {
  await initDb();
  await sql`DELETE FROM project_members WHERE project_id = ${projectId} AND user_id = ${userId}`;
  const project = await getProject(projectId);
  if (project?.customer?.userId === userId) await patchProject(projectId, { customer: null });
  // An account with no remaining websites cannot see anything; its links stop working too.
  const left = await sql`SELECT COUNT(*)::int AS n FROM project_members WHERE user_id = ${userId}`;
  if (left[0].n === 0) await sql`DELETE FROM auth_tokens WHERE user_id = ${userId}`;
}
