// Shared test helpers.
import { sql, initDb, __resetDbForTests, saveSettings } from '@/lib/db';
import { hashPassword, createSession, newId } from '@/lib/auth';

export async function freshDb() {
  await __resetDbForTests();
  globalThis.__cookieJar.clear();
  await initDb();
}

export async function makeUser(role = 'admin', name = role) {
  const id = newId('u');
  const email = `${name}-${id}@example.test`;
  await sql`INSERT INTO users (id, full_name, email, username, password, role, created_at)
            VALUES (${id}, ${name}, ${email}, ${name + id}, ${await hashPassword('password-123')}, ${role}, ${Date.now()})`;
  return { id, email, role };
}

export async function signIn(user) {
  globalThis.__cookieJar.clear();
  await createSession(user.id);
  return user;
}
export function signOut() { globalThis.__cookieJar.clear(); }

export function jsonReq(url, method = 'GET', body, headers = {}) {
  return new Request('http://localhost:3000' + url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

/** A fake Anthropic endpoint. `handler(body, n)` returns text, or {status, error, text, usage, stop}. */
export function mockAnthropic(handler) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('/v1/models')) {
      const r = handler({ models: true }, calls.length);
      return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const body = JSON.parse(init.body);
    calls.push(body);
    let r = await handler(body, calls.length);
    if (typeof r === 'string') r = { text: r };
    if (r.status && r.status !== 200) {
      return new Response(JSON.stringify({ type: 'error', error: { type: r.type || 'api_error', message: r.error || 'err' } }),
        { status: r.status, headers: { 'content-type': 'application/json', ...(r.headers || {}) } });
    }
    const usage = r.usage || { input_tokens: 100, output_tokens: Math.ceil((r.text || '').length / 4) };
    const events = [
      { type: 'message_start', message: { id: 'msg_test', model: body.model, usage: { input_tokens: usage.input_tokens, output_tokens: 0, cache_read_input_tokens: usage.cache_read_input_tokens || 0, cache_creation_input_tokens: usage.cache_creation_input_tokens || 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }
    ];
    const text = r.text || '';
    for (let i = 0; i < text.length; i += 400) events.push({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(i, i + 400) } });
    // `cutOff: 'timeout'` ends the stream early with an error, as when the request window closes mid-response.
    if (r.cutOff) events.push({ type: 'error', error: { type: r.cutOff, message: 'cut off' } });
    else {
      events.push({ type: 'message_delta', delta: { stop_reason: r.stop || 'end_turn' }, usage: { output_tokens: usage.output_tokens } });
      events.push({ type: 'message_stop' });
    }
    const sse = events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
    return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  globalThis.__wflFetch = fn;
  return { calls, fn };
}

export async function withKey(extra = {}) {
  return saveSettings({ anthropicKey: 'sk-ant-test', ...extra });
}
