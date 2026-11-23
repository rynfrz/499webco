'use client';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import SiteEditor from '@/components/SiteEditor';

export default function AdminSiteEditor() {
  const { id } = useParams();
  const search = useSearchParams();
  const [back, setBack] = useState('/admin/sites');
  useEffect(() => {
    fetch('/api/sites/' + id).then(r => r.json()).then(d => { if (d.site?.projectId) setBack('/admin/project/' + d.site.projectId + '?step=3'); }).catch(() => {});
  }, [id]);
  return <SiteEditor siteId={id} role="staff" backHref={back} backLabel="Back to project" initialPage={search.get('page')} />;
}
