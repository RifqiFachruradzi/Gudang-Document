import type { EvalRow, Hasil, PO, POStatus } from './types';

export const fmt = (n: number | null | undefined) => new Intl.NumberFormat('id-ID').format(n || 0);
const num = (v: unknown) => Math.max(0, Number(v) || 0);

export interface EvalInput {
  sj?: Record<string, number | '' | null | undefined>;
  fisik?: Record<string, number | undefined>;
  rusak?: Record<string, number | undefined>;
  unknown?: string[];
}

// Data PO lama (satu penerimaan per PO) dinormalkan ke model pengiriman bertahap:
// PO 'Diterima' tanpa catatan jumlah dianggap sudah diterima penuh; PO 'Ditahan' kembali
// terbuka (GRN-nya tetap menunggu persetujuan dan dihitung saat disetujui).
export function normalizePO(po: PO): PO & { diterima: Record<string, number>; grns: string[]; status: Exclude<POStatus, 'Ditahan'> } {
  const grns = po.grns || (po.grn ? [po.grn] : []);
  let diterima = po.diterima;
  if (!diterima) diterima = po.status === 'Diterima' ? Object.fromEntries(po.items.map((i) => [i.sku, i.qty])) : {};
  const status = po.status === 'Ditahan' ? 'Terbuka' : po.status;
  return { ...po, diterima, grns, status };
}

export const sisaPO = (po: PO, sku: string) => {
  const p = normalizePO(po);
  const it = p.items.find((i) => i.sku === sku);
  return it ? Math.max(0, it.qty - (p.diterima[sku] || 0)) : 0;
};
export const isOpenPO = (po: PO) => {
  const s = normalizePO(po).status;
  return s === 'Terbuka' || s === 'Sebagian';
};
export function statusAfter(po: PO, diterima: Record<string, number>): POStatus {
  if (po.status === 'Ditutup' || po.status === 'Dibatalkan') return po.status;
  if (po.items.every((i) => (diterima[i.sku] || 0) >= i.qty)) return 'Diterima';
  return po.items.some((i) => (diterima[i.sku] || 0) > 0) ? 'Sebagian' : 'Terbuka';
}

// Aturan pencocokan satu kiriman terhadap sisa PO, surat jalan, dan barang fisik.
// Dipakai di tampilan (pratinjau) dan di server (hasil resmi), sehingga keduanya selalu sama.
// Kiriman yang lebih sedikit dari sisa PO adalah pengiriman bertahap, bukan selisih:
// PO tetap terbuka untuk sisanya. Yang dinilai adalah kecocokan dengan surat jalan,
// kelebihan di atas sisa PO, barang rusak, dan kode di luar PO.
export function evaluate(poIn: PO, input: EvalInput, tol: number): { rows: EvalRow[]; hasil: Hasil; lengkap: boolean } {
  const po = normalizePO(poIn);
  const rows: EvalRow[] = po.items.map((it) => {
    const sisa = Math.max(0, it.qty - (po.diterima[it.sku] || 0));
    const f = num(input.fisik?.[it.sku]);
    const r = Math.min(num(input.rusak?.[it.sku]), f);
    const sjRaw = input.sj?.[it.sku];
    const sj = sjRaw === '' || sjRaw == null ? null : num(sjRaw);
    const baik = f - r;
    const notes: string[] = [];
    let status: EvalRow['status'];
    if (f === 0 && !sj) {
      status = 'kosong';
      if (sisa > 0) notes.push(`Tidak ada di kiriman ini, sisa ${fmt(sisa)}`);
    } else if (f === 0) {
      status = 'belum';
      notes.push(`Surat jalan ${fmt(sj)}, belum discan`);
    } else {
      const sjPct = sj != null && sj !== f ? (Math.abs(sj - f) / Math.max(sj, 1)) * 100 : 0;
      const lebih = Math.max(0, baik - sisa);
      const lebihPct = lebih ? (sisa ? (lebih / sisa) * 100 : 100) : 0;
      const rusakPct = r ? (r / f) * 100 : 0;
      if (sj != null && sj !== f) notes.push(`Surat jalan ${fmt(sj)}, fisik ${fmt(f)}`);
      if (lebih) notes.push(`Lebih ${fmt(lebih)} dari sisa PO`);
      if (r) notes.push(`${fmt(r)} rusak`);
      if (baik < sisa) notes.push(`Sisa setelah ini ${fmt(sisa - baik)}`);
      const worst = Math.max(sjPct, lebihPct, rusakPct);
      status = worst === 0 ? 'sesuai' : worst <= tol ? 'catatan' : 'tahan';
    }
    return { sku: it.sku, nama: it.nama, satuan: it.satuan, po: it.qty, sisa, sj, fisik: f, rusak: r, baik, status, notes };
  });
  const dikirim = rows.filter((r) => r.status !== 'kosong');
  const unk = (input.unknown || []).length;
  const hasil: Hasil =
    dikirim.some((r) => r.status === 'tahan' || r.status === 'belum') || unk
      ? 'Ditahan'
      : dikirim.every((r) => r.status === 'sesuai')
        ? 'Diterima'
        : 'Diterima dengan catatan';
  const lengkap = rows.every((r) => r.baik >= (r.sisa ?? r.po));
  return { rows, hasil, lengkap };
}
