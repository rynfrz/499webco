// Public: inner pages and assets of a published multi-page site
// (/preview/<slug>/about, /preview/<slug>/assets/site.css, …).
import { servePreview } from '@/lib/site/serve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  return servePreview(params.slug, params.path || []);
}
