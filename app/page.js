// Public root. Serves your own homepage if a homepage slug is set, otherwise the
// portfolio. (The tool itself lives at /admin.)
import { redirect } from 'next/navigation';
import { getSettings } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let slug = '';
  try { slug = (await getSettings()).homepageSlug || ''; } catch {}
  redirect(slug ? `/preview/${slug}/` : '/portfolio');
}
