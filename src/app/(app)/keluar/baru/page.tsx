'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { ScanBarcode, Trash } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { SignaturePad } from '@/components/signature-pad';
import { Button, Card, Empty, Input, Label, Note, PageTitle, Textarea } from '@/components/ui';
import { errMsg } from '@/lib/client';
import { fmt } from '@/lib/evaluate';
import { findByCode, stockRows } from '@/lib/stock-view';

export default function KeluarBaru() {
  const { data, can, act, toast } = useApp();
  const router = useRouter();
  const [tujuan, setTujuan] = useState('');
  const [referensi, setReferensi] = useState('');
  const [catatan, setCatatan] = useState('');
  const [items, setItems] = useState<{ sku: string; qty: number }[]>([]);
  const [pick, setPick] = useState('');
  const [sign, setSign] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const rows = useMemo(() => (data ? stockRows(data) : []), [data]);
  const bySku = useMemo(() => Object.fromEntries(rows.map((r) => [r.sku, r])), [rows]);

  if (!data) return <p className="text-muted">Memuat data gudang…</p>;
  if (!can('petugas')) return <Card><p className="m-0 text-muted">Akun Viewer hanya bisa melihat data.</p></Card>;

  function add(sku: string, n = 1) {
    setItems((x) => (x.some((i) => i.sku === sku) ? x.map((i) => (i.sku === sku ? { ...i, qty: i.qty + n } : i)) : [...x, { sku, qty: n }]));
  }
  function scan(code: string) {
    const r = findByCode(rows, code);
    if (!r) return toast(`Kode ${code} tidak dikenal`);
    add(r.sku);
    toast(`+1 ${r.nama}`);
  }
  const over = items.filter((i) => i.qty > (bySku[i.sku]?.qty || 0));

  async function save() {
    if (!tujuan.trim()) return toast('Isi tujuan barang keluar');
    if (!items.length) return toast('Tambahkan barang dulu');
    setSaving(true);
    try {
      const r = await act<{ doc: { no: string } }>('issue', { tujuan, referensi, catatan, items, ttd: sign || undefined });
      toast('Barang keluar dicatat. Stok sudah berkurang.');
      router.replace(`/keluar/${encodeURIComponent(r.doc.no)}`);
    } catch (e) {
      toast(errMsg(e));
      setSaving(false);
    }
  }

  return (
    <>
      <PageTitle>Barang keluar baru</PageTitle>
      <div className="space-y-4">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="tujuan">Tujuan (pelanggan, cabang, atau departemen)</Label><Input id="tujuan" value={tujuan} onChange={(e) => setTujuan(e.target.value)} /></div>
            <div><Label htmlFor="ref">Nomor referensi (SO, permintaan, dll., opsional)</Label><Input id="ref" value={referensi} onChange={(e) => setReferensi(e.target.value)} /></div>
          </div>
        </Card>

        <Card>
          <h3 className="mb-1 text-xl font-semibold">Barang</h3>
          <p className="mb-3 text-sm text-muted">Scan barcode/SKU lalu Enter (tiap scan +1), atau pilih dari daftar stok.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="relative">
              <ScanBarcode className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
              <Input
                ref={scanRef}
                placeholder="Scan barcode atau SKU"
                aria-label="Kode barcode atau SKU"
                autoComplete="off"
                className="pl-10 font-display text-xl"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (e.currentTarget.value.trim()) scan(e.currentTarget.value);
                  e.currentTarget.value = '';
                }}
              />
            </div>
            <select
              aria-label="Pilih barang dari stok"
              value={pick}
              onChange={(e) => { if (e.target.value) add(e.target.value); setPick(''); }}
              className="min-h-11 rounded-lg border border-line bg-soft px-3"
            >
              <option value="">Pilih barang dari stok…</option>
              {rows.filter((r) => r.qty > 0).sort((a, b) => a.nama.localeCompare(b.nama)).map((r) => (
                <option key={r.sku} value={r.sku}>{r.nama} ({r.sku}) · tersedia {fmt(r.qty)} {r.satuan}</option>
              ))}
            </select>
          </div>
          {items.length ? (
            <ul className="mt-3 divide-y divide-line">
              {items.map((i) => {
                const r = bySku[i.sku];
                const kurang = i.qty > (r?.qty || 0);
                return (
                  <li key={i.sku} className="flex flex-wrap items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <b>{r?.nama || i.sku}</b>
                      <div className={kurang ? 'text-sm font-semibold text-bad' : 'text-sm text-muted'}>{i.sku} · tersedia {fmt(r?.qty)} {r?.satuan}</div>
                    </div>
                    <Input type="number" min={1} aria-label={`Jumlah ${r?.nama || i.sku}`} value={i.qty} onChange={(e) => setItems((x) => x.map((y) => (y.sku === i.sku ? { ...y, qty: Math.max(1, Number(e.target.value) || 1) } : y)))} className="w-24! font-display text-lg" />
                    <span className="w-12 text-sm text-muted">{r?.satuan}</span>
                    <Button variant="ghost" size="sm" aria-label={`Hapus ${r?.nama || i.sku}`} onClick={() => setItems((x) => x.filter((y) => y.sku !== i.sku))}><Trash className="size-4" /></Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-3"><Empty>Belum ada barang.</Empty></div>
          )}
          {over.length > 0 && <Note tone="bad" className="mt-3">Jumlah melebihi stok untuk: {over.map((i) => bySku[i.sku]?.nama || i.sku).join(', ')}. Kurangi jumlahnya, atau lakukan stok opname bila stok sistem salah.</Note>}
        </Card>

        <Card>
          <h3 className="mb-3 text-xl font-semibold">Penerima</h3>
          <p className="mb-1.5 text-sm text-muted">Tanda tangan penerima (opsional).</p>
          <SignaturePad value={sign} onChange={setSign} />
          <Button variant="ghost" size="sm" className="mt-1.5" onClick={() => setSign(null)}>Hapus tanda tangan</Button>
          <div className="mt-3"><Label htmlFor="cat">Catatan</Label><Textarea id="cat" value={catatan} onChange={(e) => setCatatan(e.target.value)} className="min-h-16" /></div>
        </Card>

        <Button variant="primary" size="lg" className="w-full" disabled={saving || over.length > 0} onClick={save}>{saving ? 'Menyimpan…' : 'Simpan barang keluar'}</Button>
      </div>
    </>
  );
}
