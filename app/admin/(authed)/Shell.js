'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export default function Shell({ user, children }) {
  const path = usePathname();
  const router = useRouter();
  const isAdmin = user.role === 'admin';

  const nav = [
    { href: '/admin', label: '🏠 Dashboard' },
    { href: '/admin/new', label: '✦ New Business' },
    isAdmin && { href: '/admin/users', label: '👥 Users' },
    isAdmin && { href: '/admin/settings', label: '⚙ Settings' },
    { href: '/admin/account', label: '🙋 My Account' }
  ].filter(Boolean);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/admin/login');
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" style={{ width: 34, height: 34, fontSize: 17, marginBottom: 0 }}>4</div>
          <div><div className="brand-name">499web.co</div><div className="brand-sub">Find → Build → Launch</div></div>
        </div>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {nav.map(n => (
            <Link key={n.href} href={n.href}
              className={'nav-item' + ((n.href === '/admin' ? path === '/admin' : path.startsWith(n.href)) ? ' active' : '')}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div style={{ marginBottom: 8 }}>
            {user.full_name || user.username} <span className={'badge ' + user.role}>{user.role}</span>
          </div>
          <button className="nav-item" onClick={logout}>↩ Sign out</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
