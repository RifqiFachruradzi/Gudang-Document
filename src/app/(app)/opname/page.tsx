'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Download, Plus } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { Button, buttonClass, Chip, Empty, PageTitle } from '@/components/ui';
import { downloadCSV, today } from '@/lib/csv';
import { fmt } from '@/lib/evaluate';

const ADJ_TONE = { Menunggu: 'warn', Disetujui: 'ok', Ditolak: 'bad' } as const;

export default function OpnameList() {
  const { data, can, names, resolveNames } = useApp();
  const list = data ? Object.values(data.opname).sort((a, b) => b.waktu.localeCompare(a.waktu)) : [];
  useEffect(() => { resolveNames(list.map((a) => a.petugas)); }, [list, resolveNames]);
  if (!data) return <p className="text-muted">Memuat data gudang…</p>;

  function exportCSV() {
    const rows: (string | number)[][] = [['No dokumen', 'Waktu', 'Jenis', 'Status', 'Petugas', 'SKU', 'Nama barang', 'Stok sistem', 'Hitung fisik', 'Selisih', 'Satuan', 'Catatan']];
    [...list].reverse().forEach((a) => a.items.forEach((i) => rows.push([a.no, new Date(a.waktu).toLocaleString('id-ID'), a.jenis, a.status, names[a.petugas] || a.petugas, i.sku, i.nama, i.sistem, i.fisik, i.selisih, i.satuan, a.catatan])));
    downloadCSV(`penyesuaian-stok-${today()}.csv`, rows);
  }

  return (
    <>
      <PageTitle
        action={
          <div className="flex gap-2">
            <Button onClick={exportCSV}><Download className="size-4" /> Unduh CSV</Button>
            {can('petugas') && <Link href="/opname/baru" className={buttonClass('primary')}><Plus className="size-4" /> Hitung stok</Link>}
          </div>
        }
      >
        Stok opname & penyesuaian
      </PageTitle>
      <p className="-mt-2 mb-4 max-w-2xl text-sm text-muted">Hitung stok fisik di rak, catat barang rusak atau hilang. Selisih baru mengubah stok setelah disetujui Supervisor atau Admin.</p>
      {!list.length && <Empty>Belum ada penyesuaian stok.</Empty>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0">
        {list.map((a) => (
          <Link key={a.no} href={`/opname/${encodeURIComponent(a.no)}`} className="block rounded-xl border border-line bg-panel p-4 shadow-[0_1px_2px_rgba(21,33,43,.05)] transition-colors hover:border-muted">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="font-display text-xl">{a.no}</b>
              <Chip tone={ADJ_TONE[a.status]}>{a.status}</Chip>
            </div>
            <div>{a.jenis} · {a.items.length} barang</div>
            <div className="truncate text-sm text-muted">{a.items.map((i) => `${i.nama} ${i.selisih > 0 ? '+' : ''}${fmt(i.selisih)}`).join(', ')}</div>
            <div className="text-sm text-muted">{new Date(a.waktu).toLocaleString('id-ID')}{names[a.petugas] ? ` · ${names[a.petugas]}` : ''}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
