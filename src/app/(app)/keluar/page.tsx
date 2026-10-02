'use client';

import Link from 'next/link';
import { Download, Plus } from 'lucide-react';
import { useEffect } from 'react';
import { useApp } from '@/components/app-provider';
import { Button, buttonClass, Empty, PageTitle } from '@/components/ui';
import { downloadCSV, today } from '@/lib/csv';
import { fmt } from '@/lib/evaluate';

export default function KeluarList() {
  const { data, can, names, resolveNames } = useApp();
  const list = data ? Object.values(data.keluar).sort((a, b) => b.waktu.localeCompare(a.waktu)) : [];
  useEffect(() => { resolveNames(list.map((k) => k.petugas)); }, [list, resolveNames]);
  if (!data) return <p className="text-muted">Memuat data gudang…</p>;

  function exportCSV() {
    const rows: (string | number)[][] = [['No dokumen', 'Waktu', 'Tujuan', 'Referensi', 'Petugas', 'SKU', 'Nama barang', 'Jumlah', 'Satuan', 'Catatan']];
    [...list].reverse().forEach((k) => k.items.forEach((i) => rows.push([k.no, new Date(k.waktu).toLocaleString('id-ID'), k.tujuan, k.referensi, names[k.petugas] || k.petugas, i.sku, i.nama, i.qty, i.satuan, k.catatan])));
    downloadCSV(`barang-keluar-${today()}.csv`, rows);
  }

  return (
    <>
      <PageTitle
        action={
          <div className="flex gap-2">
            <Button onClick={exportCSV}><Download className="size-4" /> Unduh CSV</Button>
            {can('petugas') && <Link href="/keluar/baru" className={buttonClass('primary')}><Plus className="size-4" /> Barang keluar</Link>}
          </div>
        }
      >
        Barang keluar
      </PageTitle>
      {!list.length && <Empty>Belum ada barang keluar. Catat setiap pengiriman ke pelanggan, cabang, atau pemakaian internal supaya stok berkurang.</Empty>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0">
        {list.map((k) => (
          <Link key={k.no} href={`/keluar/${encodeURIComponent(k.no)}`} className="block rounded-xl border border-line bg-panel p-4 shadow-[0_1px_2px_rgba(21,33,43,.05)] transition-colors hover:border-muted">
            <b className="font-display text-xl">{k.no}</b>
            <div className="truncate">Ke {k.tujuan}{k.referensi ? ` · ${k.referensi}` : ''}</div>
            <div className="truncate text-sm text-muted">{k.items.map((i) => `${i.nama} ${fmt(i.qty)} ${i.satuan}`).join(', ')}</div>
            <div className="text-sm text-muted">{new Date(k.waktu).toLocaleString('id-ID')}{names[k.petugas] ? ` · ${names[k.petugas]}` : ''}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
