'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { Button, Card, cn, Input, Label, PageTitle, Textarea } from '@/components/ui';
import { errMsg } from '@/lib/client';
import { fmt } from '@/lib/evaluate';
import { stockRows } from '@/lib/stock-view';
import { JENIS_PENYESUAIAN, type JenisPenyesuaian } from '@/lib/types';

export default function OpnameBaru() {
  const { data, can, act, toast } = useApp();
  const router = useRouter();
  const [jenis, setJenis] = useState<JenisPenyesuaian>('Stok opname');
  const [catatan, setCatatan] = useState('');
  const [q, setQ] = useState('');
  const [hitung, setHitung] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const rows = useMemo(() => (data ? stockRows(data).sort((a, b) => a.lokasi.localeCompare(b.lokasi) || a.nama.localeCompare(b.nama)) : []), [data]);

  if (!data) return <p className="text-muted">Memuat data gudang…</p>;
  if (!can('petugas')) return <Card><p className="m-0 text-muted">Akun Viewer hanya bisa melihat data.</p></Card>;

  const needle = q.toLowerCase();
  const shown = rows.filter((r) => !needle || (r.nama + r.sku + r.lokasi + r.barcode).toLowerCase().includes(needle));
  const diff = rows
    .filter((r) => hitung[r.sku] !== undefined && hitung[r.sku] !== '')
    .map((r) => ({ ...r, fisik: Number(hitung[r.sku]), selisih: Number(hitung[r.sku]) - r.qty }))
    .filter((r) => r.selisih !== 0);

  async function save(setujui: boolean) {
    if (!diff.length) return toast('Belum ada selisih. Isi jumlah fisik yang berbeda dari stok sistem.');
    setSaving(true);
    try {
      const r = await act<{ doc: { no: string } }>('adjust_create', { jenis, catatan, setujui, items: diff.map((d) => ({ sku: d.sku, fisik: d.fisik })) });
      toast(setujui ? 'Penyesuaian disetujui. Stok sudah diperbarui.' : 'Penyesuaian dikirim untuk disetujui.');
      router.replace(`/opname/${encodeURIComponent(r.doc.no)}`);
    } catch (e) {
      toast(errMsg(e));
      setSaving(false);
    }
  }

  return (
    <>
      <PageTitle>Hitung stok / penyesuaian</PageTitle>
      <div className="space-y-4">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="jenis">Jenis</Label>
              <select id="jenis" value={jenis} onChange={(e) => setJenis(e.target.value as JenisPenyesuaian)} className="min-h-11 w-full rounded-lg border border-line bg-soft px-3">
                {JENIS_PENYESUAIAN.map((j) => <option key={j}>{j}</option>)}
              </select>
            </div>
            <div><Label htmlFor="cat">Catatan / alasan</Label><Textarea id="cat" value={catatan} onChange={(e) => setCatatan(e.target.value)} className="min-h-11" placeholder="Contoh: opname bulanan rak A, 3 kardus basah" /></div>
          </div>
        </Card>

        <Card className="p-0">
          <div className="border-b border-line p-4">
            <p className="mb-2 text-sm text-muted">Isi kolom <b>Hitung fisik</b> hanya untuk barang yang jumlahnya berbeda atau yang sedang dihitung. Kolom kosong tidak diubah.</p>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, SKU, barcode, atau rak" aria-label="Cari barang" className="pl-9" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-130 border-collapse">
              <thead>
                <tr className="border-b border-line text-left text-[13px] text-muted">
                  <th className="px-4 py-2 font-medium">Barang</th>
                  <th className="px-2 py-2 font-medium">Rak</th>
                  <th className="px-2 py-2 font-medium">Stok sistem</th>
                  <th className="px-2 py-2 font-medium">Hitung fisik</th>
                  <th className="px-4 py-2 font-medium">Selisih</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const v = hitung[r.sku];
                  const sel = v === undefined || v === '' ? null : Number(v) - r.qty;
                  return (
                    <tr key={r.sku} className="border-b border-line">
                      <td className="px-4 py-2"><b>{r.nama}</b><div className="text-sm text-muted">{r.sku}</div></td>
                      <td className="px-2 py-2 text-sm">{r.lokasi}</td>
                      <td className="px-2 py-2 tabular-nums">{fmt(r.qty)} {r.satuan}</td>
                      <td className="px-2 py-2">
                        <Input type="number" min={0} inputMode="numeric" aria-label={`Hitung fisik ${r.nama}`} value={v ?? ''} onChange={(e) => setHitung((h) => ({ ...h, [r.sku]: e.target.value }))} className="h-10 min-h-0! w-24! font-display text-lg" />
                      </td>
                      <td className={cn('px-4 py-2 font-semibold tabular-nums', sel == null || sel === 0 ? 'text-muted' : sel > 0 ? 'text-ok' : 'text-bad')}>
                        {sel == null ? '–' : sel === 0 ? 'Cocok' : `${sel > 0 ? '+' : ''}${fmt(sel)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!shown.length && <p className="p-4 text-muted">Tidak ada barang yang cocok.</p>}
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-sm text-muted">{diff.length} barang dengan selisih</span>
          <Button disabled={saving || !diff.length} onClick={() => save(false)}>Kirim untuk disetujui</Button>
          {can('supervisor') && <Button variant="primary" disabled={saving || !diff.length} onClick={() => save(true)}>Simpan & setujui</Button>}
        </div>
      </div>
    </>
  );
}
