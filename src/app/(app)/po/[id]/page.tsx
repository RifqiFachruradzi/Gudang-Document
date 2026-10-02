'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Ban, PackageCheck, Pencil, Trash } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { ConfirmDialog } from '@/components/dialog';
import { POProgress, POStatusChip } from '@/components/po-status';
import { Button, buttonClass, Card, Chip, Empty, keputusanTone, Note } from '@/components/ui';
import { errMsg } from '@/lib/client';
import { fmt, isOpenPO, normalizePO } from '@/lib/evaluate';

export default function PODetail() {
  const id = decodeURIComponent(useParams<{ id: string }>().id);
  const router = useRouter();
  const { data, can, act, toast, names } = useApp();
  const [dlg, setDlg] = useState<'close' | 'delete' | null>(null);
  if (!data) return <p className="text-muted">Memuat data gudang…</p>;
  const raw = data.pos[id];
  if (!raw) return <Card><p className="m-0">PO tidak ditemukan. <Link href="/po" className="underline">Daftar PO</Link></p></Card>;
  const po = normalizePO(raw);
  const grns = po.grns.map((g) => data.grn[g]).filter(Boolean).sort((a, b) => b.waktu.localeCompare(a.waktu));
  const held = grns.some((g) => g.keputusan === 'Ditahan');
  const received = Object.values(po.diterima).some((q) => q > 0);
  const open = isOpenPO(po);

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <Link href="/po" className={buttonClass('ghost')}><ArrowLeft className="size-4" /> Daftar PO</Link>
      </div>
      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-3xl font-semibold">{po.no}</h2>
            <p className="text-muted">{po.supplier} · dipesan {po.tanggal}</p>
          </div>
          <POStatusChip po={po} />
        </div>
        {po.catatan && <p className="mt-2 text-sm">{po.catatan}</p>}
        {po.alasanTutup && (
          <Note tone="bad" className="mt-3">
            {po.status === 'Ditutup' ? 'Sisa PO ditutup' : 'PO dibatalkan'} oleh {names[po.ditutupOleh || ''] || po.ditutupOleh}
            {po.ditutupWaktu ? `, ${new Date(po.ditutupWaktu).toLocaleString('id-ID')}` : ''}: {po.alasanTutup}
          </Note>
        )}
        <div className="mt-4"><POProgress po={po} /></div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-120 border-collapse">
            <thead>
              <tr className="border-b border-line text-left text-[13px] text-muted">
                {['Barang', 'Dipesan', 'Diterima', 'Sisa'].map((h) => <th key={h} className="px-1.5 py-1.5 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {po.items.map((i) => {
                const got = po.diterima[i.sku] || 0;
                return (
                  <tr key={i.sku} className="border-b border-line">
                    <td className="px-1.5 py-2"><b>{i.nama}</b><div className="text-sm text-muted">{i.sku}{i.barcode ? ` · ${i.barcode}` : ''}</div></td>
                    <td className="px-1.5 py-2 tabular-nums">{fmt(i.qty)} {i.satuan}</td>
                    <td className="px-1.5 py-2 tabular-nums">{fmt(got)}</td>
                    <td className="px-1.5 py-2 font-semibold tabular-nums">{open ? fmt(Math.max(0, i.qty - got)) : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {open && can('petugas') && <Link href={`/terima/${encodeURIComponent(id)}`} className={buttonClass('primary')}><PackageCheck className="size-4" /> Terima kiriman</Link>}
          {can('supervisor') && po.status === 'Terbuka' && !po.grns.length && <Link href={`/po/${encodeURIComponent(id)}/ubah`} className={buttonClass()}><Pencil className="size-4" /> Ubah</Link>}
          {can('supervisor') && open && <Button variant="danger" onClick={() => setDlg('close')} disabled={held}><Ban className="size-4" /> {received ? 'Tutup sisa PO' : 'Batalkan PO'}</Button>}
          {can('supervisor') && !po.grns.length && <Button variant="danger" onClick={() => setDlg('delete')}><Trash className="size-4" /> Hapus</Button>}
        </div>
        {held && can('supervisor') && open && <p className="mt-2 text-sm text-muted">PO tidak bisa ditutup selama masih ada penerimaan yang ditahan.</p>}
      </Card>

      <Card>
        <h3 className="mb-3 text-lg font-semibold">Penerimaan untuk PO ini</h3>
        {grns.length ? (
          <ul className="divide-y divide-line">
            {grns.map((g) => (
              <li key={g.no}>
                <Link href={`/riwayat/${encodeURIComponent(g.no)}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:opacity-80">
                  <div>
                    <b>{g.no}</b>
                    <div className="text-sm text-muted">{new Date(g.waktu).toLocaleString('id-ID')} · {g.items.map((r) => `${r.nama} ${fmt(r.baik)}`).join(', ')}</div>
                  </div>
                  <Chip tone={keputusanTone(g.keputusan, g.hasil)}>{g.keputusan}</Chip>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Belum ada barang yang diterima.</Empty>
        )}
      </Card>

      <ConfirmDialog
        open={dlg === 'close'}
        title={received ? `Tutup sisa ${po.no}?` : `Batalkan ${po.no}?`}
        confirmLabel={received ? 'Tutup sisa PO' : 'Batalkan PO'}
        danger
        reasonLabel="Alasan"
        onClose={() => setDlg(null)}
        onConfirm={async (alasan) => {
          try {
            await act('po_close', { id, alasan });
            toast(received ? 'Sisa PO ditutup' : 'PO dibatalkan');
            setDlg(null);
          } catch (e) { toast(errMsg(e)); }
        }}
      >
        {received ? 'Barang yang sudah diterima tetap tercatat. Sisa yang belum dikirim tidak bisa diterima lagi.' : 'PO tidak bisa menerima kiriman lagi. Tindakan ini tercatat di log audit.'}
      </ConfirmDialog>
      <ConfirmDialog
        open={dlg === 'delete'}
        title={`Hapus ${po.no}?`}
        confirmLabel="Hapus PO"
        danger
        onClose={() => setDlg(null)}
        onConfirm={async () => {
          try {
            await act('po_delete', { id });
            toast('PO dihapus');
            router.replace('/po');
          } catch (e) { toast(errMsg(e)); }
        }}
      >
        PO yang belum punya penerimaan akan dihapus permanen.
      </ConfirmDialog>
    </>
  );
}
