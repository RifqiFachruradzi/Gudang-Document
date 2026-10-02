'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { Download } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { Button, Chip, cn, keputusanTone, PageTitle } from '@/components/ui';
import { downloadCSV, today } from '@/lib/csv';
import type { GRN } from '@/lib/types';

const FILTERS: Record<string, [string, (g: GRN) => boolean]> = {
  semua: ['Semua', () => true],
  ditahan: ['Ditahan', (g) => g.keputusan === 'Ditahan'],
  catatan: ['Dengan catatan', (g) => g.keputusan !== 'Ditahan' && g.hasil !== 'Diterima'],
  diterima: ['Diterima', (g) => g.hasil === 'Diterima'],
};

function RiwayatList() {
  const { data, names, resolveNames } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const f = FILTERS[params.get('f') || ''] ? params.get('f')! : 'semua';
  const list = data ? Object.values(data.grn).sort((a, b) => b.waktu.localeCompare(a.waktu)) : [];

  useEffect(() => { resolveNames(list.flatMap((g) => [g.petugas, g.disetujuiOleh])); }, [list, resolveNames]);
  if (!data) return <p className="text-muted">Memuat data gudang…</p>;

  const nHeld = list.filter(FILTERS.ditahan[1]).length;
  const shown = list.filter(FILTERS[f][1]);

  function exportCSV() {
    const rows: (string | number | null)[][] = [['No GRN', 'Waktu', 'No PO', 'Supplier', 'No surat jalan', 'Keputusan', 'Petugas', 'Disetujui oleh', 'Pengirim', 'SKU', 'Nama barang', 'Satuan', 'Qty PO', 'Qty surat jalan', 'Qty fisik', 'Qty rusak', 'Qty baik', 'Catatan baris']];
    [...list].reverse().forEach((g) => g.items.forEach((r) => rows.push([
      g.no, new Date(g.waktu).toLocaleString('id-ID'), g.poNo, g.supplier, g.sjNo || '', g.keputusan, names[g.petugas] || g.petugas || '',
      g.disetujuiOleh ? names[g.disetujuiOleh] || g.disetujuiOleh : '', g.pengirim || '', r.sku, r.nama, r.satuan, r.po, r.sj ?? '', r.fisik, r.rusak, r.baik, r.notes.join('. '),
    ])));
    downloadCSV(`penerimaan-${today()}.csv`, rows);
  }

  return (
    <>
      <PageTitle action={<Button onClick={exportCSV}><Download className="size-4" /> Unduh CSV</Button>}>Riwayat penerimaan</PageTitle>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Saring riwayat">
        {Object.entries(FILTERS).map(([k, [label]]) => (
          <button
            key={k}
            aria-pressed={f === k}
            onClick={() => router.replace(k === 'semua' ? path : `${path}?f=${k}`)}
            className={cn('min-h-9 rounded-lg border px-3 text-sm font-medium', f === k ? 'border-ink bg-ink text-bg' : 'border-line bg-panel hover:bg-soft')}
          >
            {label}{k === 'ditahan' && nHeld ? ` (${nHeld})` : ''}
          </button>
        ))}
      </div>
      {!list.length && <p className="text-muted">Belum ada penerimaan. Bukti terima digital (GRN) akan tersimpan di sini.</p>}
      {list.length > 0 && !shown.length && <p className="text-muted">Tidak ada penerimaan dengan status ini.</p>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0">
        {shown.map((g) => (
          <Link key={g.no} href={`/riwayat/${encodeURIComponent(g.no)}`} className="block rounded-xl border border-line bg-panel p-4 shadow-[0_1px_2px_rgba(21,33,43,.05)] transition-colors hover:border-muted">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="font-display text-xl">{g.no}</b>
              <Chip tone={keputusanTone(g.keputusan, g.hasil)}>{g.keputusan}</Chip>
            </div>
            <div>{g.poNo}, {g.supplier}</div>
            <div className="text-sm text-muted">{new Date(g.waktu).toLocaleString('id-ID')}{names[g.petugas] ? ` · ${names[g.petugas]}` : ''}</div>
          </Link>
        ))}
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <RiwayatList />
    </Suspense>
  );
}
