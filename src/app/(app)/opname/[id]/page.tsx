'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { ConfirmDialog } from '@/components/dialog';
import { Button, buttonClass, Card, Chip, cn, Note } from '@/components/ui';
import { errMsg } from '@/lib/client';
import { fmt } from '@/lib/evaluate';

const TONE = { Menunggu: 'warn', Disetujui: 'ok', Ditolak: 'bad' } as const;

export default function OpnameDetail() {
  const id = decodeURIComponent(useParams<{ id: string }>().id);
  const { data, can, act, toast, names, resolveNames } = useApp();
  const a = data?.opname[id];
  const [dlg, setDlg] = useState<'approve' | 'reject' | null>(null);
  useEffect(() => { if (a) resolveNames([a.petugas, a.diputusOleh]); }, [a, resolveNames]);
  if (!data) return <p className="text-muted">Memuat data gudang…</p>;
  if (!a) return <Card><p className="m-0">Dokumen tidak ditemukan. <Link href="/opname" className="underline">Daftar penyesuaian</Link></p></Card>;

  const decide = async (keputusan: 'setujui' | 'tolak', alasan = '') => {
    try {
      await act('adjust_decide', { id, keputusan, alasan });
      toast(keputusan === 'setujui' ? 'Disetujui. Stok sudah diperbarui.' : 'Penyesuaian ditolak');
      setDlg(null);
    } catch (e) { toast(errMsg(e)); }
  };

  return (
    <>
      <div className="no-print mb-3 flex flex-wrap gap-2">
        <Link href="/opname" className={buttonClass('ghost')}><ArrowLeft className="size-4" /> Daftar penyesuaian</Link>
        <Button variant="ghost" onClick={() => window.print()}><Printer className="size-4" /> Cetak / PDF</Button>
      </div>
      <Card className="print:border-0 print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold tracking-wider text-muted uppercase">{a.jenis}</p>
            <h2 className="text-3xl font-semibold">{a.no}</h2>
          </div>
          <Chip tone={TONE[a.status]}>{a.status}</Chip>
        </div>
        <p className="mt-1 mb-3 text-sm text-muted">
          {new Date(a.waktu).toLocaleString('id-ID')} · Dihitung oleh {names[a.petugas] || a.petugas}
          {a.diputusOleh && <><br />{a.status} oleh {names[a.diputusOleh] || a.diputusOleh}{a.diputusWaktu ? `, ${new Date(a.diputusWaktu).toLocaleString('id-ID')}` : ''}</>}
        </p>
        {a.catatan && <p className="mb-3"><b>Catatan:</b> {a.catatan}</p>}
        {a.alasanTolak && <Note tone="bad" className="mb-3">Alasan ditolak: {a.alasanTolak}</Note>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-120 border-collapse">
            <thead>
              <tr className="border-b border-line text-left text-[13px] text-muted">
                {['Barang', 'Stok sistem', 'Hitung fisik', 'Selisih'].map((h) => <th key={h} className="px-1.5 py-1.5 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {a.items.map((i) => (
                <tr key={i.sku} className="border-b border-line">
                  <td className="px-1.5 py-2"><b>{i.nama}</b><div className="text-sm text-muted">{i.sku}</div></td>
                  <td className="px-1.5 py-2 tabular-nums">{fmt(i.sistem)} {i.satuan}</td>
                  <td className="px-1.5 py-2 tabular-nums">{fmt(i.fisik)} {i.satuan}</td>
                  <td className={cn('px-1.5 py-2 font-display text-2xl font-semibold tabular-nums', i.selisih > 0 ? 'text-ok' : 'text-bad')}>{i.selisih > 0 ? '+' : ''}{fmt(i.selisih)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {a.status === 'Menunggu' &&
          (can('supervisor') ? (
            <div className="no-print mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => setDlg('approve')}>Setujui dan terapkan ke stok</Button>
              <Button variant="danger" onClick={() => setDlg('reject')}>Tolak</Button>
            </div>
          ) : (
            <Note className="no-print mt-4">Menunggu persetujuan Supervisor. Stok belum berubah.</Note>
          ))}
      </Card>

      <ConfirmDialog open={dlg === 'approve'} title={`Setujui ${a.no}?`} confirmLabel="Setujui" onClose={() => setDlg(null)} onConfirm={() => decide('setujui')}>
        Selisih di tabel akan ditambahkan atau dikurangkan dari stok saat ini. Bila ada barang keluar sejak dihitung, stok tidak akan menjadi minus.
      </ConfirmDialog>
      <ConfirmDialog open={dlg === 'reject'} title={`Tolak ${a.no}?`} confirmLabel="Tolak" danger reasonLabel="Alasan penolakan" onClose={() => setDlg(null)} onConfirm={(r) => decide('tolak', r)} />
    </>
  );
}
