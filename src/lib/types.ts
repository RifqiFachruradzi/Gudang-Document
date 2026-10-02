export type Role = 'viewer' | 'petugas' | 'supervisor' | 'admin';
export type UserStatus = 'active' | 'pending' | 'disabled';

export const ROLES: Role[] = ['viewer', 'petugas', 'supervisor', 'admin'];
export const ROLE_LABEL: Record<Role, string> = { viewer: 'Viewer', petugas: 'Petugas', supervisor: 'Supervisor', admin: 'Admin' };
export const atLeast = (role: Role | undefined, min: Role) => ROLES.indexOf(role ?? 'viewer') >= ROLES.indexOf(min);

export interface PublicUser {
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  created?: string | null;
}

export interface POItem {
  sku: string;
  barcode: string;
  nama: string;
  qty: number;
  satuan: string;
}

// 'Ditahan' hanya ada di data lama (sebelum pengiriman bertahap); dinormalkan oleh normalizePO.
export type POStatus = 'Terbuka' | 'Sebagian' | 'Diterima' | 'Ditutup' | 'Dibatalkan' | 'Ditahan';

export interface PO {
  no: string;
  supplier: string;
  tanggal: string;
  status: POStatus;
  items: POItem[];
  /** Jumlah barang baik yang sudah diterima per SKU (dari semua GRN yang diterima). */
  diterima?: Record<string, number>;
  /** Semua GRN untuk PO ini, termasuk yang ditahan. */
  grns?: string[];
  /** GRN terakhir (data lama memakai satu GRN per PO). */
  grn?: string;
  catatan?: string;
  dibuatOleh?: string;
  ditutupOleh?: string;
  ditutupWaktu?: string;
  alasanTutup?: string;
}

export interface Barang {
  sku: string;
  barcode: string;
  nama: string;
  satuan: string;
  lokasi?: string;
  minStok?: number;
}

export interface Supplier {
  id: string;
  nama: string;
  kontak?: string;
  telepon?: string;
  alamat?: string;
}

export interface IssueItem {
  sku: string;
  nama: string;
  satuan: string;
  qty: number;
}

/** Barang keluar (Goods Issue). */
export interface GoodsIssue {
  no: string;
  waktu: string;
  petugas: string;
  tujuan: string;
  referensi: string;
  catatan: string;
  items: IssueItem[];
  ttd: boolean;
}

export const JENIS_PENYESUAIAN = ['Stok opname', 'Barang rusak', 'Barang hilang', 'Koreksi input'] as const;
export type JenisPenyesuaian = (typeof JENIS_PENYESUAIAN)[number];

export interface AdjustmentItem {
  sku: string;
  nama: string;
  satuan: string;
  sistem: number;
  fisik: number;
  selisih: number;
}

/** Stok opname / penyesuaian stok. Selisih baru diterapkan ke stok setelah disetujui. */
export interface Adjustment {
  no: string;
  waktu: string;
  petugas: string;
  jenis: JenisPenyesuaian;
  catatan: string;
  items: AdjustmentItem[];
  status: 'Menunggu' | 'Disetujui' | 'Ditolak';
  diputusOleh?: string;
  diputusWaktu?: string;
  alasanTolak?: string;
}

export interface StockItem {
  sku: string;
  nama: string;
  satuan: string;
  qty: number;
  lokasi?: string;
  update?: string;
}

export type RowStatus = 'sesuai' | 'catatan' | 'tahan' | 'belum' | 'kosong';
export type Hasil = 'Diterima' | 'Diterima dengan catatan' | 'Ditahan';
export type Keputusan = Hasil | 'Diterima, disetujui supervisor';
export const APPROVED: Keputusan = 'Diterima, disetujui supervisor';

export interface EvalRow {
  sku: string;
  nama: string;
  satuan: string;
  po: number;
  /** Sisa PO sebelum kiriman ini (data lama tidak punya). */
  sisa?: number;
  sj: number | null;
  fisik: number;
  rusak: number;
  baik: number;
  status: RowStatus;
  notes: string[];
}

export interface Inspection {
  kondisi: 'baik' | 'rusak' | 'ragu';
  temuan: string[];
  saran: string;
}

export interface GRN {
  no: string;
  poId: string;
  poNo: string;
  supplier: string;
  waktu: string;
  petugas: string;
  hasil: Hasil;
  keputusan: Keputusan;
  items: EvalRow[];
  unknown: string[];
  sjNo: string;
  pengirim: string;
  catatan: string;
  inspeksi: Inspection[];
  ttd: boolean | string;
  disetujuiOleh?: string;
  disetujuiWaktu?: string;
}

export interface Settings {
  toleransi: number;
}

export interface Snapshot {
  pos: Record<string, PO>;
  stok: Record<string, StockItem>;
  grn: Record<string, GRN>;
  config: { settings?: Settings };
  barang: Record<string, Barang>;
  supplier: Record<string, Supplier>;
  keluar: Record<string, GoodsIssue>;
  opname: Record<string, Adjustment>;
  ver: number;
}

export interface ReceiveInput {
  poId: string;
  sj: Record<string, number | ''>;
  fisik: Record<string, number>;
  rusak: Record<string, number>;
  unknown: string[];
  sjNo: string;
  pengirim: string;
  catatan: string;
  inspeksi: Inspection[];
  ttd: string;
  approved: boolean;
}

export interface AuditEntry {
  waktu: string;
  email: string;
  nama: string;
  aksi: string;
  detail: string;
}
