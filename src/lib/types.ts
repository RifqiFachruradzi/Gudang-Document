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

export type POStatus = 'Terbuka' | 'Ditahan' | 'Diterima';

export interface PO {
  no: string;
  supplier: string;
  tanggal: string;
  status: POStatus;
  items: POItem[];
  grn?: string;
}

export interface StockItem {
  sku: string;
  nama: string;
  satuan: string;
  qty: number;
  lokasi?: string;
  update?: string;
}

export type RowStatus = 'sesuai' | 'catatan' | 'tahan' | 'belum';
export type Hasil = 'Diterima' | 'Diterima dengan catatan' | 'Ditahan';
export type Keputusan = Hasil | 'Diterima, disetujui supervisor';
export const APPROVED: Keputusan = 'Diterima, disetujui supervisor';

export interface EvalRow {
  sku: string;
  nama: string;
  satuan: string;
  po: number;
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
