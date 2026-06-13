'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NewProject() {
  const router = useRouter();
  useEffect(() => {
    fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      .then(r => r.json())
      .then(d => router.replace(d.project ? '/admin/project/' + d.project.id : '/admin'));
  }, [router]);
  return <div className="inner"><span className="spinner" /> Creating…</div>;
}
