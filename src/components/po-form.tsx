'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus, Trash } from 'lucide-react';
import { useApp } from './app-provider';
import { Button, Card, Input, Label, Textarea } from './ui';
import { errMsg } from '@/lib/client';
import type { PO } from '@/lib/types';

interface Row { sku: string; barcode: string; nama: string; qty: string; satuan: string }
const blank = (): Row => ({ sku: '', barcode: '', nama: '', qty: '', satuan: 'pcs' });

// Formulir PO baru / ubah PO. Supplier dan barang bisa dipilih dari master data;
// SKU yang sudah dikenal otomatis mengisi barcode, nama, dan satuan.
export function POForm({ id, initial }: { id?: string; initial?: PO }) {
  const { data, act, toast } = useApp();
  const router = useRouter();
  const [no, setNo] = useState(initial?.no || `PO-${new Date().getFullYear()}-${String(Object.keys(data?.pos || {}).length + 1).padStart(4, '0')}`);
  const [supplier, setSupplier] = useState(initial?.supplier || '');
  const [catatan, setCatatan] = useState(initial?.catatan || '');
  const [rows, setRows] = useState<Row[]>(initial ? initial.items.map((i) => ({ ...i, qty: String(i.qty) })) : [blank()]);
  const [saving, setSaving] = useState(false);
  const barang = Object.values(data?.barang || {}).sort((a, b) => a.nama.localeCompare(b.nama));
  const suppliers = Object.values(data?.supplier || {}).sort((a, b) => a.nama.localeCompare(b.nama));

  const setRow = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  function pickSku(i: number, v: string) {
    const sku = v.split(' — ')[0].trim();
    const m = data?.barang[sku];
    setRow(i, m ? { sku: m.sku, barcode: m.barcode, nama: m.nama, satuan: m.satuan } : { sku: v });
  }

  async function submit() {
    setSaving(true);
    try {
      const r = await act<{ id: string }>('po_save', {
        id, no, supplier, catatan,
        items: rows.filter((x) => x.sku.trim() || x.nama.trim() || x.qty).map((x) => ({ ...x, qty: Number(x.qty) })),
      });
      toast(id ? 'PO diperbarui' : 'PO disimpan');
      router.replace(`/po/${encodeURIComponent(r.id)}`);
    } catch (e) {
      toast(errMsg(e));
      setSaving(false);
    }
  }

  return (
    <Card>
      <datalist id="dl-barang">{barang.map((b) => <option key={b.sku} value={`${b.sku} — ${b.nama}`} />)}</datalist>
      <datalist id="dl-supplier">{suppliers.map((s) => <option key={s.id} value={s.nama} />)}</datalist>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="pno">Nomor PO</Label><Input id="pno" value={no} disabled={!!id} onChange={(e) => setNo(e.target.value)} /></div>
        <div><Label htmlFor="psup">Supplier</Label><Input id="psup" list="dl-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Pilih atau ketik nama supplier" /></div>
      </div>
      <h3 className="mt-5 mb-1 text-lg font-semibold">Barang</h3>
      <p className="mb-1 text-sm text-muted">Ketik SKU atau nama untuk memilih dari master barang. Barang baru otomatis ditambahkan ke master.</p>
      {rows.map((it, i) => (
        <div key={i} className="mt-3 grid grid-cols-2 gap-2.5 border-t border-line pt-3 lg:grid-cols-[1.3fr_1fr_2fr_100px_100px_auto] lg:items-end">
          <div><Label htmlFor={`sku${i}`}>SKU</Label><Input id={`sku${i}`} list="dl-barang" value={it.sku} onChange={(e) => pickSku(i, e.target.value)} /></div>
          <div><Label htmlFor={`bc${i}`}>Barcode</Label><Input id={`bc${i}`} inputMode="numeric" value={it.barcode} onChange={(e) => setRow(i, { barcode: e.target.value })} /></div>
          <div className="col-span-2 lg:col-span-1"><Label htmlFor={`nm${i}`}>Nama barang</Label><Input id={`nm${i}`} value={it.nama} onChange={(e) => setRow(i, { nama: e.target.value })} /></div>
          <div><Label htmlFor={`q${i}`}>Jumlah</Label><Input id={`q${i}`} type="number" min={1} value={it.qty} onChange={(e) => setRow(i, { qty: e.target.value })} /></div>
          <div><Label htmlFor={`s${i}`}>Satuan</Label><Input id={`s${i}`} value={it.satuan} onChange={(e) => setRow(i, { satuan: e.target.value })} /></div>
          {rows.length > 1 && (
            <Button variant="danger" className="col-span-2 lg:col-span-1" aria-label={`Hapus barang ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              <Trash className="size-4" /><span className="lg:sr-only">Hapus barang ini</span>
            </Button>
          )}
        </div>
      ))}
      <div className="mt-4"><Label htmlFor="pcat">Catatan (opsional)</Label><Textarea id="pcat" value={catatan} onChange={(e) => setCatatan(e.target.value)} className="min-h-16" /></div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => setRows([...rows, blank()])}><Plus className="size-4" /> Tambah barang</Button>
        <Button variant="primary" disabled={saving} onClick={submit}>{saving ? 'Menyimpan…' : id ? 'Simpan perubahan' : 'Simpan PO'}</Button>
        <Button variant="ghost" onClick={() => router.back()}>Batal</Button>
      </div>
    </Card>
  );
}
