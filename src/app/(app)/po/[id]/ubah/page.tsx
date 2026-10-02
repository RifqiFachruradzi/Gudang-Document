'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApp } from '@/components/app-provider';
import { POForm } from '@/components/po-form';
import { Card, PageTitle } from '@/components/ui';
import { normalizePO } from '@/lib/evaluate';

export default function POUbah() {
  const id = decodeURIComponent(useParams<{ id: string }>().id);
  const { data, can } = useApp();
  if (!can('supervisor')) return <Card><p className="m-0 text-muted">PO diubah oleh Supervisor atau Admin.</p></Card>;
  if (!data) return <p className="text-muted">Memuat data gudang…</p>;
  const po = data.pos[id];
  if (!po) return <Card><p className="m-0">PO tidak ditemukan. <Link href="/po" className="underline">Daftar PO</Link></p></Card>;
  const p = normalizePO(po);
  if (p.grns.length || p.status !== 'Terbuka') return <Card><p className="m-0">PO yang sudah punya penerimaan tidak bisa diubah. <Link href={`/po/${encodeURIComponent(id)}`} className="underline">Kembali ke PO</Link></p></Card>;
  return (
    <>
      <PageTitle>Ubah {po.no}</PageTitle>
      <POForm id={id} initial={po} />
    </>
  );
}
