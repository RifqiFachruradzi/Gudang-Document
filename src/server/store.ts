// Penyimpanan data gudang di Redis: kunci per koleksi, kunci proses (lock), operasi stok atomik.
import { randomBytes } from 'node:crypto';
import { fail, parseHash, redis } from './core';
import { fmt } from '@/lib/evaluate';
import type { Barang, StockItem } from '@/lib/types';

export const COLS = ['pos', 'stok', 'grn', 'config', 'barang', 'supplier', 'keluar', 'opname'] as const;
export type Col = (typeof COLS)[number];
export const KEY = (c: Col) => `gudang:${c}`;
export const QTY_KEY = 'gudang:stokqty'; // jumlah stok per SKU, diubah atomik dengan HINCRBYFLOAT
export const TTD_KEY = 'gudang:ttd'; // gambar tanda tangan per dokumen, dipisah agar sinkronisasi ringan
export const APPROVE_KEY = 'gudang:approved'; // GRN ditahan → penyetuju (cegah persetujuan ganda)
export const VER_KEY = 'gudang:ver'; // naik setiap ada perubahan; klien hanya mengunduh ulang bila berubah
export const ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

export async function getJSON<T>(col: Col, id: string): Promise<T | null> {
  const r = await redis<string | null>('HGET', KEY(col), id);
  return r ? (JSON.parse(r) as T) : null;
}
export const putJSON = (col: Col, id: string, v: unknown) => redis('HSET', KEY(col), id, JSON.stringify(v));
export const getAll = async <T>(col: Col) => parseHash<T>(await redis('HGETALL', KEY(col)));
export const bump = () => redis<number>('INCR', VER_KEY);

// Nomor dokumen berbasis waktu (contoh GRN-20261002081244); ditambah akhiran bila bentrok.
export async function newDocId(col: Col, prefix: string) {
  const base = prefix + '-' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  for (let i = 1; ; i++) {
    const id = i === 1 ? base : `${base}-${i}`;
    if (!(await redis<number>('HEXISTS', KEY(col), id))) return id;
  }
}

// Kunci proses: hanya satu permintaan yang boleh mengubah objek yang sama pada satu waktu.
export async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T | Response> {
  const key = `gudang:lock:${name}`;
  const token = randomBytes(8).toString('hex');
  let got = false;
  for (let i = 0; i < 40 && !got; i++) {
    got = (await redis<string | null>('SET', key, token, 'NX', 'EX', 20)) === 'OK';
    if (!got) await new Promise((r) => setTimeout(r, 100));
  }
  if (!got) return fail(409, 'Data sedang diproses oleh pengguna lain. Coba lagi sebentar.');
  try {
    return await fn();
  } finally {
    if ((await redis<string | null>('GET', key)) === token) await redis('DEL', key);
  }
}

// Data lama menyimpan jumlah stok di JSON; pindahkan sekali ke hash jumlah sebelum diubah atomik.
async function ensureQty(sku: string, meta?: StockItem) {
  await redis('HSETNX', QTY_KEY, sku, String(Number(meta?.qty) || 0));
}

export async function stockMetaFor(sku: string, nama: string, satuan: string, waktu: string) {
  const [meta, master] = await Promise.all([getJSON<StockItem>('stok', sku), getJSON<Barang>('barang', sku)]);
  let lokasi = master?.lokasi || meta?.lokasi;
  if (!lokasi) {
    const used = new Set(Object.values(await getAll<StockItem>('stok')).map((s) => s.lokasi));
    outer: for (const z of ['A', 'B', 'C', 'D']) for (let n = 1; n <= 20; n++) {
      const l = z + '-' + String(n).padStart(2, '0');
      if (!used.has(l)) { lokasi = l; break outer; }
    }
  }
  return { meta, next: { sku, nama: master?.nama || nama, satuan: master?.satuan || satuan, lokasi: lokasi || 'E-01', update: waktu } };
}

/** Ubah stok satu SKU secara atomik. Mengembalikan jumlah sesudahnya. */
export async function changeStock(sku: string, nama: string, satuan: string, delta: number, waktu: string) {
  const { meta, next } = await stockMetaFor(sku, nama, satuan, waktu);
  await ensureQty(sku, meta ?? undefined);
  const after = Number(await redis('HINCRBYFLOAT', QTY_KEY, sku, String(delta)));
  await putJSON('stok', sku, next);
  return after;
}

/** Tambah stok untuk barang yang diterima. */
export async function addStock(rows: { sku: string; nama: string; satuan: string; baik: number }[], waktu: string) {
  const changes: string[] = [];
  for (const r of rows) {
    if (r.baik <= 0) continue;
    const after = await changeStock(r.sku, r.nama, r.satuan, r.baik, waktu);
    changes.push(`${r.sku} +${fmt(r.baik)} → ${fmt(after)} ${r.satuan}`);
  }
  return changes;
}

/**
 * Kurangi stok untuk barang keluar. Setiap pengurangan atomik; bila ada barang yang stoknya
 * tidak cukup, semua pengurangan dibatalkan sehingga stok tidak pernah minus.
 */
export async function takeStock(items: { sku: string; nama: string; satuan: string; qty: number }[], waktu: string): Promise<{ ok: true; changes: string[] } | { ok: false; error: string }> {
  const done: { sku: string; qty: number }[] = [];
  const changes: string[] = [];
  for (const it of items) {
    const meta = await getJSON<StockItem>('stok', it.sku);
    await ensureQty(it.sku, meta ?? undefined);
    const after = Number(await redis('HINCRBYFLOAT', QTY_KEY, it.sku, String(-it.qty)));
    if (after < 0) {
      await redis('HINCRBYFLOAT', QTY_KEY, it.sku, String(it.qty));
      for (const d of done) await redis('HINCRBYFLOAT', QTY_KEY, d.sku, String(d.qty));
      return { ok: false, error: `Stok ${it.nama} tidak cukup: tersedia ${fmt(after + it.qty)} ${it.satuan}, diminta ${fmt(it.qty)}.` };
    }
    done.push({ sku: it.sku, qty: it.qty });
    changes.push(`${it.sku} -${fmt(it.qty)} → ${fmt(after)} ${it.satuan}`);
  }
  for (const it of items) {
    const meta = await getJSON<StockItem>('stok', it.sku);
    if (meta) await putJSON('stok', it.sku, { ...meta, update: waktu });
  }
  return { ok: true, changes };
}

/** Terapkan selisih stok opname. Bila hasilnya minus (barang keluar sejak dihitung), stok dijadikan 0. */
export async function adjustStock(sku: string, nama: string, satuan: string, delta: number, waktu: string) {
  let after = await changeStock(sku, nama, satuan, delta, waktu);
  if (after < 0) {
    await redis('HINCRBYFLOAT', QTY_KEY, sku, String(-after));
    after = 0;
  }
  return after;
}

export const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
export const isImage = (v: unknown, max = 400 * 1024): v is string => typeof v === 'string' && v.startsWith('data:image/') && v.length <= max;
