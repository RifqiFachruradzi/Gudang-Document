'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { ClipboardList, Layers, RotateCcwClock, ShieldCheck } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { buttonClass, Card, CardHeader, Chip, cn, Empty, keputusanTone } from '@/components/ui';
import { fmt } from '@/lib/evaluate';

export default function Beranda() {
  const { data, me, can, names, resolveNames } = useApp();
  const grn = data ? Object.values(data.grn).sort((a, b) => b.waktu.localeCompare(a.waktu)) : [];
  const open = data ? Object.entries(data.pos).filter(([, p]) => p.status === 'Terbuka').sort((a, b) => a[1].tanggal.localeCompare(b[1].tanggal)) : [];
  const held = grn.filter((g) => g.keputusan === 'Ditahan');
  const today = new Date().toDateString();
  const todayN = grn.filter((g) => new Date(g.waktu).toDateString() === today).length;
  const stok = data ? Object.values(data.stok) : [];
  const units = stok.reduce((a, s) => a + (Number(s.qty) || 0), 0);
  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';
  const recent = grn.slice(0, 5);

  useEffect(() => { resolveNames(recent.map((g) => g.petugas)); }, [recent, resolveNames]);

  const kpis = [
    { href: '/terima', icon: ClipboardList, k: 'PO menunggu', v: open.length, s: 'kiriman belum diterima' },
    { href: '/riwayat?f=ditahan', icon: ShieldCheck, k: 'Ditahan', v: held.length, s: held.length ? 'perlu persetujuan supervisor' : 'tidak ada yang tertahan', alert: held.length > 0 },
    { href: '/riwayat', icon: RotateCcwClock, k: 'Diterima hari ini', v: todayN, s: `${fmt(grn.length)} penerimaan total` },
    { href: '/stok', icon: Layers, k: 'Jenis barang', v: stok.length, s: `${fmt(units)} unit di gudang` },
  ];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold">{greet}, {me.name.split(' ')[0]}</h2>
          <p className="text-sm text-muted">{new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        {can('petugas') && (
          <Link href="/terima" className={buttonClass('primary')}>Terima barang</Link>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3.5 xl:grid-cols-4 [&>*]:min-w-0">
        {kpis.map((x) => (
          <Link
            key={x.k}
            href={x.href}
            className={cn(
              'relative block overflow-hidden rounded-xl border bg-panel px-4 py-3.5 shadow-[0_1px_2px_rgba(21,33,43,.05)] transition-colors hover:border-muted',
              x.alert ? 'border-bad bg-bad-bg pt-5 text-bad' : 'border-line',
            )}
          >
            {x.alert && <div className="hazard absolute inset-x-0 top-0 h-1.5" aria-hidden />}
            <span className={cn('flex items-center gap-1.5 text-[13px]', !x.alert && 'text-muted')}>
              <x.icon className="size-4" strokeWidth={1.8} /> {x.k}
            </span>
            <div className="mt-1 font-display text-4xl font-bold tabular-nums">{data ? fmt(x.v) : '–'}</div>
            <span className={cn('text-[13px]', !x.alert && 'text-muted')}>{x.s}</span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader title="PO menunggu kiriman" action={<Link href="/po" className="text-sm font-semibold underline underline-offset-4">Lihat semua</Link>} />
          {open.length ? (
            <ul className="divide-y divide-line">
              {open.slice(0, 5).map(([id, p]) => (
                <li key={id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <b>{p.no}</b>
                    <div className="truncate text-sm text-muted">{p.supplier}, {p.items.length} jenis barang</div>
                  </div>
                  {can('petugas') && <Link href={`/terima/${encodeURIComponent(id)}`} className={buttonClass('secondary', 'sm')}>Terima</Link>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{data ? 'Semua PO sudah diterima.' : 'Memuat…'}</Empty>
          )}
        </Card>
        <Card>
          <CardHeader title="Penerimaan terakhir" action={<Link href="/riwayat" className="text-sm font-semibold underline underline-offset-4">Lihat semua</Link>} />
          {recent.length ? (
            <ul className="divide-y divide-line">
              {recent.map((g) => (
                <li key={g.no}>
                  <Link href={`/riwayat/${encodeURIComponent(g.no)}`} className="flex items-center justify-between gap-3 py-2.5 hover:opacity-80">
                    <div className="min-w-0">
                      <b>{g.poNo}</b>
                      <div className="truncate text-sm text-muted">
                        {g.supplier} · {new Date(g.waktu).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {names[g.petugas] ? ' · ' + names[g.petugas] : ''}
                      </div>
                    </div>
                    <Chip tone={keputusanTone(g.keputusan, g.hasil)} className="shrink-0">{g.keputusan}</Chip>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{data ? 'Belum ada penerimaan.' : 'Memuat…'}</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
