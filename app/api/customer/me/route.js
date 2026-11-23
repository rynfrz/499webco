// The signed-in person and the websites they can manage.
import { requireSession, isStaff } from '@/lib/auth';
import { projectsForUser } from '@/lib/access';
import { handle, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const user = await requireSession();
  if (isStaff(user)) return json({ user: { id: user.id, name: user.full_name, email: user.email, role: user.role }, staff: true, websites: [] });
  const projects = await projectsForUser(user.id);
  return json({ user: { id: user.id, name: user.full_name, email: user.email, role: 'customer' }, staff: false, websites: projects });
});
