import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';

export default async function UsersGuard({ children }) {
  const u = await currentUser();
  if (!u || u.role !== 'admin') redirect('/admin');
  return children;
}
