import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import Shell from './Shell';

// The whole /admin app is per-user and must never be statically prerendered.
export const dynamic = 'force-dynamic';

export default async function AuthedLayout({ children }) {
  const user = await currentUser();
  if (!user) redirect('/admin/login');
  return <Shell user={user}>{children}</Shell>;
}
