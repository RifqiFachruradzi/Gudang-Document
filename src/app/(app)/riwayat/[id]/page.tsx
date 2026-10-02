'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { Button, buttonClass, Card, keputusanTone, Note, Stamp, STATUS_CHIP } from '@/components/ui';
import { errMsg } from '@/lib/client';
import { fmt } from '@/lib/evaluate';

export default function GRNDetail() {
  const { id: raw } = useParams<{ id: string }>();
  const id = decodeURIComponent(raw);
  const { data, can, names, resolveNames, approve, signature, toast } = useApp();
  const g = data?.grn[id];
  const [sig, setSig] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  useEffect(() => { if (g) resolveNames([g.petugas, g.disetujuiOleh]); }, [g, resolveNames]);
  useEffect(() => {
    if (!g?.ttd) return;
    if (typeof g.ttd === 'string') { setSig(g.ttd); return; }
    let live = true;
    signature(id).then((t) => { if (live) setSig(t); }).catch(() => {});
    return () => { live = false; };
  }, [g?.ttd, id, signature]);

  if (!data) return <p className="text-muted">Memuat data gudang…</p>;
  if (!g) return <Card><p className="m-0">Penerimaan tidak ditemukan. <Link href="/riwayat" className="underline">Kembali ke riwayat</Link></p></Card>;

  const held = g.keputusan === 'Ditahan';
  async function doApprove() {
    setApproving(true);
    try {
      await approve(id);
      toast('Disetujui. Stok sudah bertambah.');
    } catch (e) {
      toast(errMsg(e, 'Gagal menyetujui'));
    }
    setApproving(false);
  }

  return (
    <>
      <div className="no-print mb-3 flex flex-wrap gap-2">
        <Link href="/riwayat" className={buttonClass('ghost')}><ArrowLeft className="size-4" /> Kembali ke riwayat</Link>
        <Button variant="ghost" onClick={() => window.print()}><Printer className="size-4" /> Cetak / PDF</Button>
      </div>
      <Card className="print:border-0 print:p-0 print:shadow-none">
        <h2 className="text-3xl font-semibold">{g.no}</h2>
        <p className="mt-1 mb-3 text-sm text-muted">
          {g.poNo}, {g.supplier}
          <br />
          {new Date(g.waktu).toLocaleString('id-ID')}{g.sjNo ? `, surat jalan ${g.sjNo}` : ''}
          <br />
          Petugas: {names[g.petugas] || g.petugas || 'Petugas gudang'}{g.pengirim ? `, pengirim: ${g.pengirim}` : ''}
          {g.disetujuiOleh && (
            <>
              <br />
              Disetujui: {names[g.disetujuiOleh] || g.disetujuiOleh}{g.disetujuiWaktu ? `, ${new Date(g.disetujuiWaktu).toLocaleString('id-ID')}` : ''}
            </>
          )}
        </p>
        <Stamp tone={keputusanTone(g.keputusan, g.hasil)} title={g.keputusan} />
        {held &&
          (can('supervisor') ? (
            <Note className="no-print mt-3">
              Barang ditahan dan stok belum bertambah. Periksa selisihnya, lalu setujui bila barang tetap diterima.
              <div className="mt-2"><Button variant="primary" disabled={approving} onClick={doApprove}>{approving ? 'Menyimpan…' : 'Setujui dan masukkan ke stok'}</Button></div>
            </Note>
          ) : (
            <Note className="no-print mt-3">Menunggu persetujuan Supervisor. Stok belum bertambah.</Note>
          ))}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-130 border-collapse">
            <thead>
              <tr className="border-b border-line text-left text-[13px] text-muted">
                {['Barang', 'Sisa PO', 'SJ', 'Fisik', 'Rusak', 'Status'].map((h) => <th key={h} className="px-1.5 py-1.5 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {g.items.map((r) => (
                <tr key={r.sku} className="border-b border-line align-top">
                  <td className="px-1.5 py-2"><b>{r.nama}</b>{r.notes.length > 0 && <div className="text-sm">{r.notes.join('. ')}</div>}</td>
                  {[r.sisa ?? r.po, r.sj, r.fisik, r.rusak].map((v, i) => (
                    <td key={i} className="px-1.5 py-2 font-display text-2xl font-semibold tabular-nums">{v == null ? '-' : fmt(v)}</td>
                  ))}
                  <td className="px-1.5 py-2">{STATUS_CHIP[r.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {g.unknown?.length > 0 && <p className="mt-2 text-sm">Kode di luar PO: {g.unknown.join(', ')}</p>}
        {(g.inspeksi || []).map((x, i) => (
          <div key={i} className="mt-3 border-l-4 border-accent bg-soft px-3 py-2.5 text-[15px]">Inspeksi foto AI: kondisi {x.kondisi}. {x.temuan.join('. ')}</div>
        ))}
        {g.catatan && <p className="mt-3"><b>Catatan:</b> {g.catatan}</p>}
        {g.ttd && (
          <>
            <p className="mt-4 mb-1 text-sm text-muted">Tanda tangan pengirim</p>
            {sig ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sig} alt="Tanda tangan pengirim" className="max-h-30 rounded-lg border border-line bg-white" />
            ) : (
              <div className="h-30 w-72 max-w-full animate-pulse rounded-lg border border-line bg-soft" aria-label="Memuat tanda tangan" />
            )}
          </>
        )}
      </Card>
    </>
  );
}
