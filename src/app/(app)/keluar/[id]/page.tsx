'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { Button, buttonClass, Card } from '@/components/ui';
import { fmt } from '@/lib/evaluate';

export default function KeluarDetail() {
  const id = decodeURIComponent(useParams<{ id: string }>().id);
  const { data, names, resolveNames, signature } = useApp();
  const k = data?.keluar[id];
  const [sig, setSig] = useState<string | null>(null);
  useEffect(() => { if (k) resolveNames([k.petugas]); }, [k, resolveNames]);
  useEffect(() => {
    if (!k?.ttd) return;
    let live = true;
    signature(id).then((t) => { if (live) setSig(t); }).catch(() => {});
    return () => { live = false; };
  }, [k?.ttd, id, signature]);

  if (!data) return <p className="text-muted">Memuat data gudang…</p>;
  if (!k) return <Card><p className="m-0">Dokumen tidak ditemukan. <Link href="/keluar" className="underline">Daftar barang keluar</Link></p></Card>;

  return (
    <>
      <div className="no-print mb-3 flex flex-wrap gap-2">
        <Link href="/keluar" className={buttonClass('ghost')}><ArrowLeft className="size-4" /> Daftar barang keluar</Link>
        <Button variant="ghost" onClick={() => window.print()}><Printer className="size-4" /> Cetak surat jalan</Button>
      </div>
      <Card className="print:border-0 print:p-0 print:shadow-none">
        <p className="text-sm font-semibold tracking-wider text-muted uppercase">Surat jalan / barang keluar</p>
        <h2 className="text-3xl font-semibold">{k.no}</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Tujuan: <b className="text-ink">{k.tujuan}</b>{k.referensi ? ` · Ref. ${k.referensi}` : ''}
          <br />
          {new Date(k.waktu).toLocaleString('id-ID')} · Petugas: {names[k.petugas] || k.petugas}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-100 border-collapse">
            <thead>
              <tr className="border-b border-line text-left text-[13px] text-muted">
                <th className="px-1.5 py-1.5 font-medium">No</th>
                <th className="px-1.5 py-1.5 font-medium">Barang</th>
                <th className="px-1.5 py-1.5 font-medium">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {k.items.map((i, n) => (
                <tr key={i.sku} className="border-b border-line">
                  <td className="px-1.5 py-2 text-muted">{n + 1}</td>
                  <td className="px-1.5 py-2"><b>{i.nama}</b><div className="text-sm text-muted">{i.sku}</div></td>
                  <td className="px-1.5 py-2 font-display text-2xl font-semibold tabular-nums">{fmt(i.qty)} <span className="font-sans text-sm font-normal text-muted">{i.satuan}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {k.catatan && <p className="mt-3"><b>Catatan:</b> {k.catatan}</p>}
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-sm text-muted">Penerima</p>
            {k.ttd ? (
              // eslint-disable-next-line @next/next/no-img-element
              sig ? <img src={sig} alt="Tanda tangan penerima" className="max-h-30 rounded-lg border border-line bg-white" /> : <div className="h-30 w-72 max-w-full animate-pulse rounded-lg border border-line bg-soft" />
            ) : (
              <div className="h-24 border-b border-dashed border-muted" aria-label="Tempat tanda tangan penerima" />
            )}
          </div>
          <div>
            <p className="mb-1 text-sm text-muted">Petugas gudang</p>
            <div className="flex h-24 items-end border-b border-dashed border-muted pb-1">{names[k.petugas] || k.petugas}</div>
          </div>
        </div>
      </Card>
    </>
  );
}
