'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { POProgress, POStatusChip } from '@/components/po-status';
import { Button, buttonClass, Card, cn, Input, Label, PageTitle } from '@/components/ui';
import { errMsg } from '@/lib/client';
import { normalizePO } from '@/lib/evaluate';

const FILTERS = { aktif: 'Aktif', semua: 'Semua', selesai: 'Selesai' } as const;

export default function POPage() {
  const { data, tol, can, act, toast } = useApp();
  const [tolInput, setTolInput] = useState('');
  const [f, setF] = useState<keyof typeof FILTERS>('aktif');
  const [q, setQ] = useState('');
  useEffect(() => { setTolInput(String(tol)); }, [tol]);
  if (!data) return <p className="text-muted">Memuat data gudang…</p>;

  const needle = q.toLowerCase();
  const list = Object.entries(data.pos)
    .map(([id, p]) => [id, normalizePO(p)] as const)
    .filter(([, p]) => (f === 'semua' ? true : f === 'aktif' ? p.status === 'Terbuka' || p.status === 'Sebagian' : p.status !== 'Terbuka' && p.status !== 'Sebagian'))
    .filter(([, p]) => !needle || (p.no + p.supplier + p.items.map((i) => i.nama + i.sku).join(' ')).toLowerCase().includes(needle))
    .sort((a, b) => b[1].tanggal.localeCompare(a[1].tanggal) || b[1].no.localeCompare(a[1].no));

  return (
    <>
      <PageTitle action={can('supervisor') ? <Link href="/po/baru" className={buttonClass('primary')}><Plus className="size-4" /> Buat PO</Link> : undefined}>Purchase order</PageTitle>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5" role="group" aria-label="Saring PO">
          {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((k) => (
            <button key={k} aria-pressed={f === k} onClick={() => setF(k)} className={cn('min-h-9 rounded-lg border px-3 text-sm font-medium', f === k ? 'border-ink bg-ink text-bg' : 'border-line bg-panel hover:bg-soft')}>
              {FILTERS[k]}
            </button>
          ))}
        </div>
        <div className="relative min-w-50 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor PO, supplier, atau barang" aria-label="Cari PO" className="min-h-9! pl-9" />
        </div>
      </div>

      {!list.length && <p className="text-muted">Tidak ada PO{f === 'aktif' ? ' yang masih aktif' : ''}.</p>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0">
        {list.map(([id, p]) => (
          <Link key={id} href={`/po/${encodeURIComponent(id)}`} className="block rounded-xl border border-line bg-panel p-4 shadow-[0_1px_2px_rgba(21,33,43,.05)] transition-colors hover:border-muted">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="font-display text-xl">{p.no}</b>
              <POStatusChip po={p} />
            </div>
            <div className="truncate">{p.supplier}</div>
            <div className="mb-2 text-sm text-muted">{p.items.length} jenis barang · dipesan {p.tanggal}</div>
            <POProgress po={p} />
          </Link>
        ))}
      </div>

      <Card className="mt-6">
        <h3 className="mb-2 text-lg font-semibold">Aturan verifikasi</h3>
        <Label htmlFor="tol">Toleransi selisih jumlah (%)</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input id="tol" type="number" min={0} max={50} value={tolInput} onChange={(e) => setTolInput(e.target.value)} disabled={!can('supervisor')} className="w-30!" />
          <Button
            disabled={!can('supervisor')}
            onClick={async () => {
              try { await act('settings', { toleransi: Number(tolInput) }); toast('Toleransi disimpan'); } catch (e) { toast(errMsg(e)); }
            }}
          >
            Simpan
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted">
          Selisih surat jalan, kelebihan dari sisa PO, atau barang rusak di bawah angka ini diterima dengan catatan. Di atasnya, barang ditahan untuk persetujuan supervisor. Kiriman yang lebih sedikit dari sisa PO dianggap pengiriman bertahap.
          {!can('supervisor') && ' Hanya Supervisor atau Admin yang bisa mengubah toleransi.'}
        </p>
      </Card>
    </>
  );
}
