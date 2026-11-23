// Public: serve a published preview at /preview/<slug>/.
import { servePreview } from '@/lib/site/serve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  return servePreview(params.slug, []);
}
