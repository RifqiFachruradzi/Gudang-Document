'use client';

import { useApp } from '@/components/app-provider';
import { POForm } from '@/components/po-form';
import { Card, PageTitle } from '@/components/ui';

export default function POBaru() {
  const { data, can } = useApp();
  if (!can('supervisor')) return <Card><p className="m-0 text-muted">PO dibuat oleh Supervisor atau Admin.</p></Card>;
  if (!data) return <p className="text-muted">Memuat data gudang…</p>;
  return (
    <>
      <PageTitle>PO baru</PageTitle>
      <POForm />
    </>
  );
}
