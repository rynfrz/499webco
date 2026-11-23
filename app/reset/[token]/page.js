import '../../dashboard/dashboard.css';
import { ResetSet } from '@/components/CustomerAuth';

export const metadata = { title: 'New password · 499 Web Co.' };
export const dynamic = 'force-dynamic';

export default function Page({ params }) { return <ResetSet token={params.token} />; }
