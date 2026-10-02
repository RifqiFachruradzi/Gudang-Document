import type { EvalRow, Hasil, PO } from './types';

export const fmt = (n: number | null | undefined) => new Intl.NumberFormat('id-ID').format(n || 0);
const num = (v: unknown) => Math.max(0, Number(v) || 0);

export interface EvalInput {
  sj?: Record<string, number | '' | null | undefined>;
  fisik?: Record<string, number | undefined>;
  rusak?: Record<string, number | undefined>;
  unknown?: string[];
}

// Aturan pencocokan PO vs surat jalan vs barang fisik. Dipakai di tampilan (pratinjau)
// dan di server (hasil resmi), sehingga keduanya selalu sama.
export function evaluate(po: PO, input: EvalInput, tol: number): { rows: EvalRow[]; hasil: Hasil } {
  const rows: EvalRow[] = po.items.map((it) => {
    const f = num(input.fisik?.[it.sku]);
    const r = Math.min(num(input.rusak?.[it.sku]), f);
    const sjRaw = input.sj?.[it.sku];
    const sj = sjRaw === '' || sjRaw == null ? null : num(sjRaw);
    const baik = f - r;
    const diff = baik - it.qty;
    const pct = it.qty ? (Math.abs(diff) / it.qty) * 100 : 0;
    const sjBeda = sj != null && sj !== f;
    const sjPct = sjBeda ? (Math.abs(sj - f) / Math.max(f, 1)) * 100 : 0;
    const notes: string[] = [];
    if (diff < 0) notes.push('Kurang ' + fmt(-diff));
    if (diff > 0) notes.push('Lebih ' + fmt(diff));
    if (r) notes.push(fmt(r) + ' rusak');
    if (sjBeda) notes.push('Surat jalan ' + fmt(sj) + ', fisik ' + fmt(f));
    const status = f === 0 ? 'belum' : diff === 0 && !sjBeda && r === 0 ? 'sesuai' : pct <= tol && sjPct <= tol ? 'catatan' : 'tahan';
    return { sku: it.sku, nama: it.nama, satuan: it.satuan, po: it.qty, sj, fisik: f, rusak: r, baik, status, notes };
  });
  const unk = (input.unknown || []).length;
  const hasil: Hasil =
    rows.every((r) => r.status === 'sesuai') && !unk
      ? 'Diterima'
      : rows.some((r) => r.status === 'tahan' || r.status === 'belum') || unk
        ? 'Ditahan'
        : 'Diterima dengan catatan';
  return { rows, hasil };
}
