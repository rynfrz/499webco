import '../../dashboard/dashboard.css';
import { Welcome } from '@/components/CustomerAuth';

export const metadata = { title: 'Welcome · 499 Web Co.' };
export const dynamic = 'force-dynamic';

export default function Page({ params }) { return <Welcome token={params.token} />; }
