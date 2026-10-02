'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { buttonClass, Card, Chip, cn, Empty } from '@/components/ui';
import { fmt } from '@/lib/evaluate';
import { movements, stockRows } from '@/lib/stock-view';

// Kartu stok: saldo per mutasi, dihitung mundur dari stok saat ini.
export default function KartuStok() {
  const sku = decodeURIComponent(useParams<{ sku: string }>().sku);
  const { data } = useApp();
  if (!data) return <p className="text-muted">Memuat data gudang…</p>;
  const s = stockRows(data).find((r) => r.sku === sku);
  if (!s) return <Card><p className="m-0">Barang tidak ditemukan. <Link href="/stok" className="underline">Kembali ke stok</Link></p></Card>;
  const mv = movements(data, sku);
  let saldo = s.qty;
  const rows = mv.map((m) => {
    const r = { ...m, saldo };
    saldo -= m.qty;
    return r;
  });

  return (
    <>
      <div className="mb-3"><Link href="/stok" className={buttonClass('ghost')}><ArrowLeft className="size-4" /> Kembali ke stok</Link></div>
      <Card className="mb-4">
        <p className="text-sm font-semibold tracking-wider text-muted uppercase">Kartu stok</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-semibold">{s.nama}</h2>
            <p className="text-muted">{s.sku}{s.barcode ? ` · ${s.barcode}` : ''} · rak {s.lokasi}</p>
          </div>
          <div className="text-right">
            <div className={cn('font-display text-5xl leading-none font-bold tabular-nums', s.menipis && 'text-bad')}>{fmt(s.qty)}</div>
            <div className="text-muted">{s.satuan}{s.minStok ? ` · minimum ${fmt(s.minStok)}` : ''}</div>
          </div>
        </div>
      </Card>
      <Card className="p-0">
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-150 border-collapse">
              <thead>
                <tr className="border-b border-line text-left text-[13px] text-muted">
                  {['Waktu', 'Jenis', 'Dokumen', 'Keterangan', 'Jumlah', 'Saldo'].map((h) => <th key={h} className="px-3 py-2 font-medium first:pl-5">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.ref + m.jenis} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 pl-5 text-sm whitespace-nowrap">{new Date(m.waktu).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-3 py-2.5"><Chip tone={m.jenis === 'Masuk' ? 'ok' : m.jenis === 'Keluar' ? 'warn' : 'neutral'}>{m.jenis}</Chip></td>
                    <td className="px-3 py-2.5 text-sm"><Link href={m.href} className="font-semibold underline underline-offset-2">{m.ref}</Link></td>
                    <td className="px-3 py-2.5 text-sm">{m.ket}</td>
                    <td className={cn('px-3 py-2.5 font-semibold tabular-nums', m.qty > 0 ? 'text-ok' : 'text-bad')}>{m.qty > 0 ? '+' : ''}{fmt(m.qty)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{fmt(m.saldo)}</td>
                  </tr>
                ))}
                {saldo !== 0 && (
                  <tr><td colSpan={5} className="py-2.5 pr-3 pl-5 text-sm text-muted">Saldo awal (sebelum riwayat tercatat)</td><td className="px-3 py-2.5 tabular-nums text-muted">{fmt(saldo)}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5"><Empty>Belum ada mutasi untuk barang ini.</Empty></div>
        )}
      </Card>
    </>
  );
}
