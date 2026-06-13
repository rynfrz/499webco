import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { currentUser } from '@/lib/auth';
import { licenseStatus } from '@/lib/license';
import { brand } from '@/lib/brand';
import Shell from './Shell';

// The whole /admin app is per-user and must never be statically prerendered.
export const dynamic = 'force-dynamic';

export default async function AuthedLayout({ children }) {
  const user = await currentUser();
  if (!user) redirect('/admin/login');

  // License gate (no-op until a public key is set in lib/license.js).
  const lic = licenseStatus(process.env.LICENSE_KEY, headers().get('host'));
  if (lic.enforced && !lic.ok) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0d12', color: '#eef2fb', fontFamily: '-apple-system,Segoe UI,Inter,sans-serif', padding: 24 }}>
        <div style={{ maxWidth: 440, background: '#12151d', border: '1px solid #232838', borderRadius: 16, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 30 }}>🔒</div>
          <h1 style={{ fontSize: 22, margin: '12px 0 8px' }}>License required</h1>
          <p style={{ color: '#9aa3bd', fontSize: 14.5, lineHeight: 1.6 }}>{lic.reason}</p>
          <p style={{ color: '#9aa3bd', fontSize: 13.5, marginTop: 14 }}>
            Add a valid <b>LICENSE_KEY</b> to this deployment's environment variables and redeploy.
            Need a license for {brand.name}? Contact <a href={`mailto:${brand.email}`} style={{ color: '#5fd8ff' }}>{brand.email}</a>.
          </p>
        </div>
      </div>
    );
  }

  return <Shell user={user}>{children}</Shell>;
}
