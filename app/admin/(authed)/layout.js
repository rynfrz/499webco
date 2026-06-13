import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import Shell from './Shell';

export default async function AuthedLayout({ children }) {
  const user = await currentUser();
  if (!user) redirect('/admin/login');
  return <Shell user={user}>{children}</Shell>;
}
