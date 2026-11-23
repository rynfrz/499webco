'use client';
import { useParams } from 'next/navigation';
import Marketplace from '@/components/Marketplace';

export default function Integrations() {
  const { id } = useParams();
  return (
    <>
      <h1>Integrations</h1>
      <p className="cd-sub">Switch on useful tools for your website. Each one explains what it does and walks you through setup.</p>
      <Marketplace siteId={id} editorHref={`/dashboard/site/${id}/edit`} />
    </>
  );
}
