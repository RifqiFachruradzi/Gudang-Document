'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Plus, Trash } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { Button, buttonClass, Card, Chip, Input, Label, PageTitle } from '@/components/ui';
import { errMsg } from '@/lib/client';
import { fmt } from '@/lib/evaluate';

interface DraftItem { sku: string; barcode: string; nama: string; qty: string; satuan: string }
const blankItem = (): DraftItem => ({ sku: '', barcode: '', nama: '', qty: '', satuan: 'pcs' });

function POPage() {
  const { data, tol, can, savePO, saveTolerance, toast } = useApp();
  const params = useSearchParams();
  const [tolInput, setTolInput] = useState<string>('');
  const [draft, setDraft] = useState<{ no: string; supplier: string; items: DraftItem[] } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setTolInput(String(tol)); }, [tol]);
  useEffect(() => {
    if (params.get('baru') && data && can('supervisor') && !draft) newDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, data]);

  if (!data) return <p className="text-muted">Memuat data gudang…</p>;
  const list = Object.entries(data.pos).sort((a, b) => b[1].tanggal.localeCompare(a[1].tanggal));

  function newDraft() {
    const n = Object.keys(data!.pos).length + 1;
    setDraft({ no: `PO-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`, supplier: '', items: [blankItem()] });
  }
  const setItem = (i: number, k: keyof DraftItem, v: string) => setDraft((d) => d && { ...d, items: d.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) });

  async function submit() {
    if (!draft) return;
    const items = draft.items
      .filter((i) => i.sku.trim() && i.nama.trim() && Number(i.qty) > 0)
      .map((i) => ({ sku: i.sku.trim(), barcode: i.barcode.trim(), nama: i.nama.trim(), qty: Number(i.qty), satuan: i.satuan.trim() || 'pcs' }));
    if (!draft.no.trim() || !draft.supplier.trim()) return toast('Isi nomor PO dan nama supplier');
    if (!items.length) return toast('Tambahkan minimal satu barang dengan SKU, nama, dan jumlah');
    const id = draft.no.trim().replace(/[^A-Za-z0-9_\-.]/g, '-');
    if (data!.pos[id]) return toast(`Nomor ${draft.no.trim()} sudah dipakai`);
    setSaving(true);
    try {
      await savePO(id, { no: draft.no.trim(), supplier: draft.supplier.trim(), tanggal: new Date().toISOString().slice(0, 10), status: 'Terbuka', items });
      setDraft(null);
      toast('PO disimpan');
    } catch (e) {
      toast(errMsg(e));
    }
    setSaving(false);
  }

  return (
    <>
      <Card className="mb-4">
        <h3 className="mb-2 text-xl font-semibold">Aturan verifikasi</h3>
        <Label htmlFor="tol">Toleransi selisih jumlah (%)</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input id="tol" type="number" min={0} max={50} value={tolInput} onChange={(e) => setTolInput(e.target.value)} disabled={!can('supervisor')} className="w-30!" />
          <Button
            disabled={!can('supervisor')}
            onClick={async () => {
              const v = Math.max(0, Math.min(50, Number(tolInput) || 0));
              try { await saveTolerance(v); toast(`Toleransi ${v}% disimpan`); } catch (e) { toast(errMsg(e)); }
            }}
          >
            Simpan
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted">
          Selisih di bawah angka ini diterima dengan catatan. Di atasnya, barang ditahan untuk persetujuan supervisor.
          {!can('supervisor') && ' Hanya Supervisor atau Admin yang bisa mengubah toleransi.'}
        </p>
      </Card>

      {draft ? (
        <Card className="mb-4">
          <h3 className="mb-3 text-xl font-semibold">PO baru</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="pno">Nomor PO</Label><Input id="pno" value={draft.no} onChange={(e) => setDraft({ ...draft, no: e.target.value })} /></div>
            <div><Label htmlFor="psup">Supplier</Label><Input id="psup" value={draft.supplier} onChange={(e) => setDraft({ ...draft, supplier: e.target.value })} /></div>
          </div>
          {draft.items.map((it, i) => (
            <div key={i} className="mt-4 grid grid-cols-2 gap-2.5 border-t border-line pt-3 lg:grid-cols-[1fr_1fr_2fr_100px_110px_auto] lg:items-end">
              <div><Label htmlFor={`sku${i}`}>SKU</Label><Input id={`sku${i}`} value={it.sku} onChange={(e) => setItem(i, 'sku', e.target.value)} /></div>
              <div><Label htmlFor={`bc${i}`}>Barcode</Label><Input id={`bc${i}`} inputMode="numeric" value={it.barcode} onChange={(e) => setItem(i, 'barcode', e.target.value)} /></div>
              <div className="col-span-2 lg:col-span-1"><Label htmlFor={`nm${i}`}>Nama barang</Label><Input id={`nm${i}`} value={it.nama} onChange={(e) => setItem(i, 'nama', e.target.value)} /></div>
              <div><Label htmlFor={`q${i}`}>Jumlah</Label><Input id={`q${i}`} type="number" min={1} value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} /></div>
              <div><Label htmlFor={`s${i}`}>Satuan</Label><Input id={`s${i}`} value={it.satuan} onChange={(e) => setItem(i, 'satuan', e.target.value)} /></div>
              {draft.items.length > 1 && (
                <Button variant="danger" className="col-span-2 lg:col-span-1" aria-label={`Hapus barang ${i + 1}`} onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })}>
                  <Trash className="size-4" /><span className="lg:sr-only">Hapus barang ini</span>
                </Button>
              )}
            </div>
          ))}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => setDraft({ ...draft, items: [...draft.items, blankItem()] })}><Plus className="size-4" /> Tambah barang</Button>
            <Button variant="primary" disabled={saving} onClick={submit}>{saving ? 'Menyimpan…' : 'Simpan PO'}</Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>Batal</Button>
          </div>
        </Card>
      ) : (
        <PageTitle action={can('supervisor') ? <Button variant="primary" onClick={newDraft}><Plus className="size-4" /> Buat PO</Button> : <span className="text-sm text-muted">PO dibuat oleh Supervisor atau Admin.</span>}>
          Daftar PO
        </PageTitle>
      )}

      {!list.length && <p className="text-muted">Belum ada PO.</p>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0">
        {list.map(([id, p]) => (
          <Card key={id}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold">{p.no}</h3>
              <Chip tone={p.status === 'Diterima' ? 'ok' : p.status === 'Ditahan' ? 'bad' : 'neutral'}>{p.status === 'Ditahan' ? 'Ditahan, menunggu persetujuan' : p.status}</Chip>
            </div>
            <div>{p.supplier}</div>
            <div className="text-sm text-muted">{p.tanggal}</div>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {p.items.map((i) => <li key={i.sku}>{i.nama}: {fmt(i.qty)} {i.satuan}</li>)}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              {p.status === 'Terbuka' && can('petugas') && <Link href={`/terima/${encodeURIComponent(id)}`} className={buttonClass('secondary', 'sm')}>Terima barang</Link>}
              {p.grn && <Link href={`/riwayat/${encodeURIComponent(p.grn)}`} className={buttonClass('ghost', 'sm')}>Lihat GRN</Link>}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <POPage />
    </Suspense>
  );
}
