// Form submissions for a site (the owner's inbox in the dashboard).
import { siteAccess } from '@/lib/access';
import { listSubmissions } from '@/lib/forms';
import { handle, json } from '@/lib/http';

export const runtime = 'nodejs';

export const GET = handle(async (req, { params }) => {
  const { site, role } = await siteAccess(params.id, { full: false });
  const list = await listSubmissions(site.id);
  // Delivery diagnostics are for staff; customers just see their messages.
  return json({ messages: role === 'staff' ? list : list.map(m => ({ id: m.id, form: m.form, page: m.page, fields: m.fields, at: m.at })) });
});
