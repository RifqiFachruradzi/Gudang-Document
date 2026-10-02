import type { Snapshot } from './types';

export interface StockRow {
  sku: string;
  barcode: string;
  nama: string;
  satuan: string;
  qty: number;
  lokasi: string;
  minStok?: number;
  update?: string;
  menipis: boolean;
}

// Gabungkan jumlah stok dengan master barang (nama, satuan, rak, stok minimum).
export function stockRows(d: Snapshot): StockRow[] {
  const skus = new Set([...Object.keys(d.stok), ...Object.keys(d.barang)]);
  return [...skus].map((sku) => {
    const s = d.stok[sku];
    const m = d.barang[sku];
    const qty = Number(s?.qty) || 0;
    const minStok = m?.minStok;
    return {
      sku,
      barcode: m?.barcode || '',
      nama: m?.nama || s?.nama || sku,
      satuan: m?.satuan || s?.satuan || 'pcs',
      qty,
      lokasi: m?.lokasi || s?.lokasi || '-',
      minStok,
      update: s?.update,
      menipis: minStok != null && minStok > 0 && qty <= minStok,
    };
  });
}

// Cari barang dari kode scan: barcode atau SKU (tanpa membedakan huruf besar/kecil).
export function findByCode(rows: StockRow[], code: string) {
  const c = code.trim().toLowerCase();
  return rows.find((r) => r.barcode.toLowerCase() === c || r.sku.toLowerCase() === c);
}

export interface Movement {
  waktu: string;
  jenis: 'Masuk' | 'Keluar' | 'Penyesuaian';
  ref: string;
  href: string;
  ket: string;
  qty: number;
}

// Kartu stok: semua mutasi satu barang dari penerimaan, barang keluar, dan penyesuaian yang disetujui.
export function movements(d: Snapshot, sku: string): Movement[] {
  const out: Movement[] = [];
  for (const g of Object.values(d.grn)) {
    if (g.keputusan === 'Ditahan') continue;
    const r = g.items.find((x) => x.sku === sku);
    if (r && r.baik > 0) out.push({ waktu: g.disetujuiWaktu && g.hasil === 'Ditahan' ? g.disetujuiWaktu : g.waktu, jenis: 'Masuk', ref: g.no, href: `/riwayat/${encodeURIComponent(g.no)}`, ket: `${g.poNo}, ${g.supplier}`, qty: r.baik });
  }
  for (const k of Object.values(d.keluar)) {
    const r = k.items.find((x) => x.sku === sku);
    if (r) out.push({ waktu: k.waktu, jenis: 'Keluar', ref: k.no, href: `/keluar/${encodeURIComponent(k.no)}`, ket: k.tujuan, qty: -r.qty });
  }
  for (const a of Object.values(d.opname)) {
    if (a.status !== 'Disetujui') continue;
    const r = a.items.find((x) => x.sku === sku);
    if (r) out.push({ waktu: a.diputusWaktu || a.waktu, jenis: 'Penyesuaian', ref: a.no, href: `/opname/${encodeURIComponent(a.no)}`, ket: a.jenis, qty: r.selisih });
  }
  return out.sort((a, b) => b.waktu.localeCompare(a.waktu));
}
