'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Download, Search, TriangleAlert } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { Button, Card, cn, Empty, Input, PageTitle } from '@/components/ui';
import { downloadCSV, today } from '@/lib/csv';
import { fmt } from '@/lib/evaluate';
import { stockRows } from '@/lib/stock-view';

export default function StokPage() {
  const { data } = useApp();
  const [q, setQ] = useState('');
  const [low, setLow] = useState(false);
  if (!data) return <p className="text-muted">Memuat data gudang…</p>;
  const all = stockRows(data);
  const needle = q.toLowerCase();
  const nLow = all.filter((s) => s.menipis).length;
  const list = all
    .filter((s) => (!low || s.menipis) && (!needle || (s.nama + s.sku + s.lokasi + s.barcode).toLowerCase().includes(needle)))
    .sort((a, b) => a.lokasi.localeCompare(b.lokasi) || a.nama.localeCompare(b.nama));

  function exportCSV() {
    const rows: (string | number)[][] = [['SKU', 'Barcode', 'Nama barang', 'Jumlah', 'Satuan', 'Lokasi rak', 'Stok minimum', 'Diperbarui']];
    [...all].sort((a, b) => a.sku.localeCompare(b.sku)).forEach((s) => rows.push([s.sku, s.barcode, s.nama, s.qty, s.satuan, s.lokasi, s.minStok ?? '', s.update ? new Date(s.update).toLocaleString('id-ID') : '']));
    downloadCSV(`stok-${today()}.csv`, rows);
  }

  return (
    <>
      <PageTitle action={<Button onClick={exportCSV}><Download className="size-4" /> Unduh CSV</Button>}>Stok real-time</PageTitle>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-50 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, SKU, barcode, atau lokasi rak" aria-label="Cari stok" className="pl-10" />
        </div>
        <button aria-pressed={low} onClick={() => setLow((v) => !v)} className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium', low ? 'border-bad bg-bad-bg text-bad' : 'border-line bg-panel hover:bg-soft')}>
          <TriangleAlert className="size-4" /> Stok menipis ({nLow})
        </button>
      </div>
      <Card className="p-0">
        {list.length ? (
          <ul className="divide-y divide-line">
            {list.map((s) => (
              <li key={s.sku}>
                <Link href={`/stok/${encodeURIComponent(s.sku)}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-soft">
                  <div className="min-w-0">
                    <b>{s.nama}</b>
                    <div className="text-sm text-muted">{s.sku}, rak {s.lokasi}</div>
                    <div className="text-sm text-muted">Diperbarui {s.update ? new Date(s.update).toLocaleString('id-ID') : '-'}</div>
                  </div>
                  <div className="text-right">
                    <div className={cn('font-display text-3xl leading-none font-semibold tabular-nums', s.menipis && 'text-bad')}>{fmt(s.qty)}</div>
                    <div className="text-sm text-muted">{s.satuan}</div>
                    {s.menipis && <div className="text-xs font-semibold text-bad">Di bawah minimum {fmt(s.minStok)}</div>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-5"><Empty>{q || low ? 'Tidak ada barang yang cocok.' : 'Stok akan muncul setelah penerimaan pertama disimpan.'}</Empty></div>
        )}
      </Card>
    </>
  );
}
