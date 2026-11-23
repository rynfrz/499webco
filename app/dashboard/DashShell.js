'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createContext, useContext } from 'react';
import { brand } from '@/lib/brand';

const Ctx = createContext({ websites: [], current: null, user: null });
export const useDash = () => useContext(Ctx);

export default function DashShell({ user, websites, children }) {
  const path = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  // Which website is in view: from the URL, else the first one.
  const fromPath = (path.match(/\/dashboard\/site\/([^/]+)/) || [])[1];
  const want = fromPath || search.get('site');
  const current = websites.find(w => w.siteId === want) || websites[0] || null;

  // The editor is full-screen.
  if (/\/dashboard\/site\/[^/]+\/edit/.test(path)) return <Ctx.Provider value={{ websites, current, user }}>{children}</Ctx.Provider>;

  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); window.location.assign('/login'); }
  const sid = current?.siteId;
  const nav = [
    { href: '/dashboard' + (sid && websites.length > 1 ? `?site=${sid}` : ''), label: 'My Website', on: path === '/dashboard' },
    sid && { href: `/dashboard/site/${sid}/messages`, label: 'Messages', on: path.endsWith('/messages') },
    sid && { href: `/dashboard/site/${sid}/integrations`, label: 'Integrations', on: path.endsWith('/integrations') },
    sid && { href: `/dashboard/site/${sid}/settings`, label: 'Website Settings', on: path.endsWith('/settings') },
    { href: '/dashboard/account' + (sid && websites.length > 1 ? `?site=${sid}` : ''), label: 'Account', on: path.startsWith('/dashboard/account') }
  ].filter(Boolean);

  return (
    <Ctx.Provider value={{ websites, current, user }}>
      <div className="cd">
        <header className="cd-top">
          <div className="cd-top-in">
            <Link className="cd-logo" href="/dashboard"><i>4</i>{brand.name}</Link>
            <nav className="cd-nav" aria-label="Main">{nav.map(n => <Link key={n.label} href={n.href} className={n.on ? 'on' : ''}>{n.label}</Link>)}</nav>
            {websites.length > 1 && (
              <select aria-label="Website" style={{ width: 'auto', maxWidth: 220 }} value={sid || ''} onChange={e => router.push(`/dashboard?site=${e.target.value}`)}>
                {websites.filter(w => w.siteId).map(w => <option key={w.siteId} value={w.siteId}>{w.name}</option>)}
              </select>
            )}
            <div className="cd-who"><span>{user.name || user.email}</span><button className="cd-btn small" onClick={logout}>Sign out</button></div>
          </div>
        </header>
        <main className="cd-main">{children}</main>
      </div>
    </Ctx.Provider>
  );
}
