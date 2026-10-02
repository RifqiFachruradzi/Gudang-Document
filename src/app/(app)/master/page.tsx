'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Pencil, Plus, Search, Trash } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { ConfirmDialog } from '@/components/dialog';
import { Button, Card, cn, Empty, Input, Label, PageTitle } from '@/components/ui';
import { errMsg } from '@/lib/client';
import { fmt } from '@/lib/evaluate';
import type { Barang, Supplier } from '@/lib/types';

type Tab = 'barang' | 'supplier';
const emptyBarang = { sku: '', barcode: '', nama: '', satuan: 'pcs', lokasi: '', minStok: '' };
const emptySupplier = { id: '', nama: '', kontak: '', telepon: '', alamat: '' };

function MasterPage() {
  const { data, can, act, toast } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const tab: Tab = params.get('tab') === 'supplier' ? 'supplier' : 'barang';
  const [q, setQ] = useState('');
  const [bForm, setBForm] = useState<typeof emptyBarang & { baru?: boolean } | null>(null);
  const [sForm, setSForm] = useState<typeof emptySupplier | null>(null);
  const [del, setDel] = useState<{ kind: Tab; id: string; nama: string } | null>(null);
  const [saving, setSaving] = useState(false);
  if (!data) return <p className="text-muted">Memuat data gudang…</p>;
  const edit = can('supervisor');
  const needle = q.toLowerCase();

  const barang = Object.values(data.barang)
    .filter((b) => !needle || (b.sku + b.nama + b.barcode + (b.lokasi || '')).toLowerCase().includes(needle))
    .sort((a, b) => a.nama.localeCompare(b.nama));
  const suppliers = Object.values(data.supplier)
    .filter((s) => !needle || (s.nama + (s.kontak || '') + (s.telepon || '')).toLowerCase().includes(needle))
    .sort((a, b) => a.nama.localeCompare(b.nama));

  async function run(action: string, payload: Record<string, unknown>, ok: string, done: () => void) {
    setSaving(true);
    try { await act(action, payload); toast(ok); done(); } catch (e) { toast(errMsg(e)); }
    setSaving(false);
  }
  const openBarang = (b?: Barang) => setBForm(b ? { ...b, barcode: b.barcode || '', lokasi: b.lokasi || '', minStok: b.minStok == null ? '' : String(b.minStok) } : { ...emptyBarang, baru: true });
  const openSupplier = (s?: Supplier) => setSForm(s ? { ...emptySupplier, ...s } as typeof emptySupplier : { ...emptySupplier });

  return (
    <>
      <PageTitle
        action={edit && (
          <Button variant="primary" onClick={() => (tab === 'barang' ? openBarang() : openSupplier())}>
            <Plus className="size-4" /> {tab === 'barang' ? 'Tambah barang' : 'Tambah supplier'}
          </Button>
        )}
      >
        Master data
      </PageTitle>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5" role="tablist">
          {(['barang', 'supplier'] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => { router.replace(t === 'barang' ? '/master' : '/master?tab=supplier'); setQ(''); }} className={cn('min-h-9 rounded-lg border px-3 text-sm font-medium', tab === t ? 'border-ink bg-ink text-bg' : 'border-line bg-panel hover:bg-soft')}>
              {t === 'barang' ? `Barang (${Object.keys(data.barang).length})` : `Supplier (${Object.keys(data.supplier).length})`}
            </button>
          ))}
        </div>
        <div className="relative min-w-50 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === 'barang' ? 'Cari SKU, nama, barcode, atau rak' : 'Cari supplier'} aria-label="Cari" className="min-h-9! pl-9" />
        </div>
      </div>
      {!edit && <p className="mb-3 text-sm text-muted">Master data diubah oleh Supervisor atau Admin.</p>}

      {tab === 'barang' && bForm && (
        <Card className="mb-4">
          <h3 className="mb-3 text-lg font-semibold">{bForm.baru ? 'Barang baru' : `Ubah ${bForm.nama}`}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div><Label htmlFor="msku">SKU</Label><Input id="msku" value={bForm.sku} disabled={!bForm.baru} onChange={(e) => setBForm({ ...bForm, sku: e.target.value })} /></div>
            <div><Label htmlFor="mbc">Barcode</Label><Input id="mbc" inputMode="numeric" value={bForm.barcode} onChange={(e) => setBForm({ ...bForm, barcode: e.target.value })} /></div>
            <div><Label htmlFor="mnm">Nama barang</Label><Input id="mnm" value={bForm.nama} onChange={(e) => setBForm({ ...bForm, nama: e.target.value })} /></div>
            <div><Label htmlFor="msat">Satuan</Label><Input id="msat" value={bForm.satuan} onChange={(e) => setBForm({ ...bForm, satuan: e.target.value })} /></div>
            <div><Label htmlFor="mlok">Lokasi rak</Label><Input id="mlok" value={bForm.lokasi} placeholder="Contoh: A-01" onChange={(e) => setBForm({ ...bForm, lokasi: e.target.value })} /></div>
            <div><Label htmlFor="mmin">Stok minimum (opsional)</Label><Input id="mmin" type="number" min={0} value={bForm.minStok} onChange={(e) => setBForm({ ...bForm, minStok: e.target.value })} /></div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" disabled={saving} onClick={() => run('barang_save', bForm, 'Barang disimpan', () => setBForm(null))}>Simpan</Button>
            <Button variant="ghost" onClick={() => setBForm(null)}>Batal</Button>
          </div>
        </Card>
      )}
      {tab === 'supplier' && sForm && (
        <Card className="mb-4">
          <h3 className="mb-3 text-lg font-semibold">{sForm.id ? `Ubah ${sForm.nama}` : 'Supplier baru'}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="snm">Nama supplier</Label><Input id="snm" value={sForm.nama} onChange={(e) => setSForm({ ...sForm, nama: e.target.value })} /></div>
            <div><Label htmlFor="skt">Nama kontak</Label><Input id="skt" value={sForm.kontak} onChange={(e) => setSForm({ ...sForm, kontak: e.target.value })} /></div>
            <div><Label htmlFor="stl">Telepon</Label><Input id="stl" inputMode="tel" value={sForm.telepon} onChange={(e) => setSForm({ ...sForm, telepon: e.target.value })} /></div>
            <div><Label htmlFor="sal">Alamat</Label><Input id="sal" value={sForm.alamat} onChange={(e) => setSForm({ ...sForm, alamat: e.target.value })} /></div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" disabled={saving} onClick={() => run('supplier_save', sForm, 'Supplier disimpan', () => setSForm(null))}>Simpan</Button>
            <Button variant="ghost" onClick={() => setSForm(null)}>Batal</Button>
          </div>
        </Card>
      )}

      <Card className="p-0">
        {tab === 'barang' ? (
          barang.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-170 border-collapse">
                <thead>
                  <tr className="border-b border-line text-left text-[13px] text-muted">
                    {['Barang', 'Barcode', 'Satuan', 'Rak', 'Stok', 'Minimum', ''].map((h, i) => <th key={i} className="px-3 py-2 font-medium first:pl-5">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {barang.map((b) => {
                    const qty = Number(data.stok[b.sku]?.qty) || 0;
                    return (
                      <tr key={b.sku} className="border-b border-line last:border-0">
                        <td className="py-2.5 pr-3 pl-5"><b>{b.nama}</b><div className="text-sm text-muted">{b.sku}</div></td>
                        <td className="px-3 py-2.5 text-sm">{b.barcode || '-'}</td>
                        <td className="px-3 py-2.5 text-sm">{b.satuan}</td>
                        <td className="px-3 py-2.5 text-sm">{b.lokasi || '-'}</td>
                        <td className={cn('px-3 py-2.5 tabular-nums', b.minStok && qty <= b.minStok ? 'font-semibold text-bad' : '')}>{fmt(qty)}</td>
                        <td className="px-3 py-2.5 tabular-nums text-muted">{b.minStok ? fmt(b.minStok) : '-'}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          {edit && (
                            <>
                              <Button variant="ghost" size="sm" aria-label={`Ubah ${b.nama}`} onClick={() => openBarang(b)}><Pencil className="size-4" /></Button>
                              <Button variant="ghost" size="sm" aria-label={`Hapus ${b.nama}`} onClick={() => setDel({ kind: 'barang', id: b.sku, nama: b.nama })}><Trash className="size-4 text-bad" /></Button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="p-5"><Empty>{q ? 'Tidak ada barang yang cocok.' : 'Belum ada barang. Barang dari PO baru otomatis masuk ke sini.'}</Empty></div>
        ) : suppliers.length ? (
          <ul className="divide-y divide-line">
            {suppliers.map((s) => {
              const n = Object.values(data.pos).filter((p) => p.supplier.toLowerCase() === s.nama.toLowerCase()).length;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <b>{s.nama}</b>
                    <div className="text-sm text-muted">{[s.kontak, s.telepon, s.alamat].filter(Boolean).join(' · ') || 'Belum ada kontak'} · {n} PO</div>
                  </div>
                  {edit && (
                    <span className="whitespace-nowrap">
                      <Button variant="ghost" size="sm" aria-label={`Ubah ${s.nama}`} onClick={() => openSupplier(s)}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="sm" aria-label={`Hapus ${s.nama}`} onClick={() => setDel({ kind: 'supplier', id: s.id, nama: s.nama })}><Trash className="size-4 text-bad" /></Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : <div className="p-5"><Empty>{q ? 'Tidak ada supplier yang cocok.' : 'Belum ada supplier. Supplier dari PO baru otomatis masuk ke sini.'}</Empty></div>}
      </Card>

      <ConfirmDialog
        open={!!del}
        title={`Hapus ${del?.nama}?`}
        confirmLabel="Hapus"
        danger
        onClose={() => setDel(null)}
        onConfirm={async () => { if (del) await run(del.kind === 'barang' ? 'barang_delete' : 'supplier_delete', del.kind === 'barang' ? { sku: del.id } : { id: del.id }, 'Dihapus', () => setDel(null)); }}
      >
        {del?.kind === 'barang' ? 'Barang hanya bisa dihapus bila stoknya 0 dan tidak ada di PO yang terbuka.' : 'Supplier hanya bisa dihapus bila tidak punya PO yang terbuka.'}
      </ConfirmDialog>
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <MasterPage />
    </Suspense>
  );
}
