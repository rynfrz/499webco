import { redirect } from 'next/navigation';
import { currentUser, isStaff } from '@/lib/auth';
import { projectsForUser } from '@/lib/access';
import DashShell from './DashShell';
import './dashboard.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your website · 499 Web Co.', robots: { index: false, follow: false } };

export default async function DashboardLayout({ children }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  // The studio team has its own home.
  if (isStaff(user)) redirect('/admin');
  const websites = await projectsForUser(user.id);
  return <DashShell user={{ name: user.full_name, email: user.email }} websites={websites}>{children}</DashShell>;
}
