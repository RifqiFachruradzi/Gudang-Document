'use client';

import Link from 'next/link';
import { useApp } from '@/components/app-provider';
import { SupplierRisk } from '@/components/supplier-risk';
import { POProgress, POStatusChip } from '@/components/po-status';
import { buttonClass, Card, PageTitle } from '@/components/ui';
import { fmt, isOpenPO } from '@/lib/evaluate';

export default function TerimaList() {
  const { data, can } = useApp();
  if (!data) return <p className="text-muted">Memuat data gudang…</p>;
  const open = Object.entries(data.pos).filter(([, p]) => isOpenPO(p)).sort((a, b) => a[1].tanggal.localeCompare(b[1].tanggal));

  if (!open.length) {
    return (
      <Card>
        <h2 className="mb-1 text-2xl font-semibold">Belum ada PO yang menunggu</h2>
        <p className="mb-3 text-muted">Semua PO sudah diterima, ditutup, atau dibatalkan.</p>
        {can('supervisor') && <Link href="/po/baru" className={buttonClass('primary')}>Buat PO</Link>}
      </Card>
    );
  }
  if (!can('petugas')) {
    return <Card><p className="m-0 text-muted">Akun Viewer hanya bisa melihat data. Minta admin mengubah peran Anda untuk menerima barang.</p></Card>;
  }

  return (
    <>
      <PageTitle>Pilih PO untuk kiriman yang datang</PageTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0">
        {open.map(([id, p]) => (
          <Link key={id} href={`/terima/${encodeURIComponent(id)}`} className="block rounded-xl border border-line bg-panel p-4 shadow-[0_1px_2px_rgba(21,33,43,.05)] transition-colors hover:border-muted">
            <div className="flex items-center justify-between gap-3">
              <b className="font-display text-xl">{p.no}</b>
              <POStatusChip po={p} />
            </div>
            <div>{p.supplier}</div>
            <div className="text-sm text-muted">
              {p.items.length} jenis barang, {fmt(p.items.reduce((a, i) => a + Number(i.qty), 0))} unit, dipesan {p.tanggal}
            </div>
            <div className="my-2"><POProgress po={p} /></div>
            <SupplierRisk supplier={p.supplier} grn={data.grn} />
          </Link>
        ))}
      </div>
    </>
  );
}
