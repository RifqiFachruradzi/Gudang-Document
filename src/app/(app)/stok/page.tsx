'use client';

import { useState } from 'react';
import { Download, Search } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { Button, Card, Empty, Input, PageTitle } from '@/components/ui';
import { downloadCSV, today } from '@/lib/csv';
import { fmt } from '@/lib/evaluate';

export default function StokPage() {
  const { data } = useApp();
  const [q, setQ] = useState('');
  if (!data) return <p className="text-muted">Memuat data gudang…</p>;
  const all = Object.values(data.stok);
  const needle = q.toLowerCase();
  const list = all
    .filter((s) => !needle || (s.nama + s.sku + (s.lokasi || '')).toLowerCase().includes(needle))
    .sort((a, b) => String(a.lokasi).localeCompare(String(b.lokasi)));

  function exportCSV() {
    const rows: (string | number)[][] = [['SKU', 'Nama barang', 'Jumlah', 'Satuan', 'Lokasi rak', 'Diperbarui']];
    [...all].sort((a, b) => a.sku.localeCompare(b.sku)).forEach((s) => rows.push([s.sku, s.nama, s.qty, s.satuan, s.lokasi || '', s.update ? new Date(s.update).toLocaleString('id-ID') : '']));
    downloadCSV(`stok-${today()}.csv`, rows);
  }

  return (
    <>
      <PageTitle action={<Button onClick={exportCSV}><Download className="size-4" /> Unduh CSV</Button>}>Stok real-time</PageTitle>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, SKU, atau lokasi rak" aria-label="Cari stok" className="pl-10" />
      </div>
      <Card className="p-0">
        {list.length ? (
          <ul className="divide-y divide-line">
            {list.map((s) => (
              <li key={s.sku} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <b>{s.nama}</b>
                  <div className="text-sm text-muted">{s.sku}, rak {s.lokasi || '-'}</div>
                  <div className="text-sm text-muted">Diperbarui {s.update ? new Date(s.update).toLocaleString('id-ID') : '-'}</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-3xl font-semibold leading-none tabular-nums">{fmt(s.qty)}</div>
                  <div className="text-sm text-muted">{s.satuan}</div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-5"><Empty>{q ? 'Tidak ada barang yang cocok.' : 'Stok akan muncul setelah penerimaan pertama disimpan.'}</Empty></div>
        )}
      </Card>
    </>
  );
}
