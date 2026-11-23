'use client';
import { useParams, useSearchParams } from 'next/navigation';
import SiteEditor from '@/components/SiteEditor';

export default function CustomerEditor() {
  const { id } = useParams();
  const search = useSearchParams();
  return <SiteEditor siteId={id} role="owner" backHref="/dashboard" backLabel="Dashboard" initialPage={search.get('page')} openPages={search.get('add') === '1'} />;
}
