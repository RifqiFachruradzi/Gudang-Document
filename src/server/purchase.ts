// Kelola PO (buat, ubah, batalkan, tutup sisa, hapus) dan master data barang & supplier.
import { audit, fail, json, redis } from './core';
import { bump, clip, getAll, getJSON, ID_RE, KEY, putJSON, QTY_KEY, withLock } from './store';
import { normalizePO } from '@/lib/evaluate';
import { atLeast, type Barang, type GRN, type PO, type POItem, type PublicUser, type StockItem, type Supplier } from '@/lib/types';

const needSupervisor = (me: PublicUser, what: string) => (atLeast(me.role, 'supervisor') ? null : fail(403, `Hanya Supervisor atau Admin yang bisa ${what}`));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'supplier';

function cleanItems(raw: unknown): POItem[] | string {
  if (!Array.isArray(raw) || !raw.length) return 'Tambahkan minimal satu barang';
  const seen = new Set<string>();
  const items: POItem[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const sku = clip(r.sku, 60);
    const nama = clip(r.nama, 120);
    const qty = Number(r.qty);
    if (!sku || !nama || !(qty > 0)) return 'Setiap barang wajib punya SKU, nama, dan jumlah lebih dari 0';
    if (!ID_RE.test(sku)) return `SKU ${sku} berisi karakter yang tidak diizinkan`;
    if (seen.has(sku)) return `SKU ${sku} muncul dua kali`;
    seen.add(sku);
    items.push({ sku, barcode: clip(r.barcode, 60), nama, qty, satuan: clip(r.satuan, 20) || 'pcs' });
  }
  return items;
}

// Barang dan supplier baru dari PO otomatis masuk master data (data yang sudah ada tidak ditimpa).
async function learnMaster(items: POItem[], supplier: string) {
  for (const it of items) {
    await redis('HSETNX', KEY('barang'), it.sku, JSON.stringify({ sku: it.sku, barcode: it.barcode, nama: it.nama, satuan: it.satuan } satisfies Barang));
  }
  const all = await getAll<Supplier>('supplier');
  if (!Object.values(all).some((s) => s.nama.toLowerCase() === supplier.toLowerCase())) {
    let id = slug(supplier);
    for (let i = 2; all[id]; i++) id = `${slug(supplier)}-${i}`;
    await putJSON('supplier', id, { id, nama: supplier } satisfies Supplier);
  }
}

export async function savePO(b: Record<string, unknown>, me: PublicUser) {
  const deny = needSupervisor(me, 'membuat atau mengubah PO');
  if (deny) return deny;
  const no = clip(b.no, 60);
  const supplier = clip(b.supplier, 120);
  if (!no || !supplier) return fail(400, 'Isi nomor PO dan nama supplier');
  const items = cleanItems(b.items);
  if (typeof items === 'string') return fail(400, items);
  const editId = b.id ? String(b.id) : null;
  const id = editId || no.replace(/[^A-Za-z0-9_\-.]/g, '-');
  if (!ID_RE.test(id)) return fail(400, 'Nomor PO tidak valid');

  return withLock(`po:${id}`, async () => {
    const prev = await getJSON<PO>('pos', id);
    if (!editId && prev) return fail(409, `Nomor ${no} sudah dipakai`);
    if (editId) {
      if (!prev) return fail(404, 'PO tidak ditemukan');
      const p = normalizePO(prev);
      if (p.grns.length || p.status !== 'Terbuka') return fail(409, 'PO yang sudah punya penerimaan tidak bisa diubah. Tutup sisanya lalu buat PO baru bila perlu.');
    }
    const po: PO = {
      ...(prev || {}),
      no: editId ? prev!.no : no, supplier, items, catatan: clip(b.catatan, 1000),
      tanggal: prev?.tanggal || new Date().toISOString().slice(0, 10), status: 'Terbuka', diterima: {}, grns: [],
      dibuatOleh: prev?.dibuatOleh || me.email,
    };
    await putJSON('pos', id, po);
    await learnMaster(items, supplier);
    await bump();
    await audit(me, editId ? 'ubah PO' : 'buat PO', `${po.no} (${supplier}): ${items.map((i) => `${i.sku} ${i.qty} ${i.satuan}`).join(', ')}`);
    return json({ ok: true, id, po });
  });
}

// Batalkan (belum ada barang diterima) atau tutup sisa (sudah sebagian diterima).
export async function closePO(b: Record<string, unknown>, me: PublicUser) {
  const deny = needSupervisor(me, 'membatalkan atau menutup PO');
  if (deny) return deny;
  const id = String(b.id || '');
  const alasan = clip(b.alasan, 300);
  if (!alasan) return fail(400, 'Tulis alasan pembatalan atau penutupan');
  return withLock(`po:${id}`, async () => {
    const stored = ID_RE.test(id) ? await getJSON<PO>('pos', id) : null;
    if (!stored) return fail(404, 'PO tidak ditemukan');
    const po = normalizePO(stored);
    if (po.status !== 'Terbuka' && po.status !== 'Sebagian') return fail(409, `PO berstatus ${po.status}`);
    const grns = (await Promise.all(po.grns.map((g) => getJSON<GRN>('grn', g)))).filter(Boolean) as GRN[];
    if (grns.some((g) => g.keputusan === 'Ditahan')) return fail(409, 'Masih ada penerimaan yang ditahan untuk PO ini. Setujui dulu dari menu Riwayat.');
    const received = Object.values(po.diterima).some((q) => q > 0);
    const status = received ? 'Ditutup' : 'Dibatalkan';
    await putJSON('pos', id, { ...po, status, alasanTutup: alasan, ditutupOleh: me.email, ditutupWaktu: new Date().toISOString() });
    await bump();
    await audit(me, received ? 'tutup sisa PO' : 'batalkan PO', `${po.no}: ${alasan}`);
    return json({ ok: true, status });
  });
}

export async function deletePO(b: Record<string, unknown>, me: PublicUser) {
  const deny = needSupervisor(me, 'menghapus PO');
  if (deny) return deny;
  const id = String(b.id || '');
  return withLock(`po:${id}`, async () => {
    const stored = ID_RE.test(id) ? await getJSON<PO>('pos', id) : null;
    if (!stored) return fail(404, 'PO tidak ditemukan');
    if (normalizePO(stored).grns.length) return fail(409, 'PO yang sudah punya penerimaan tidak bisa dihapus. Gunakan Tutup sisa.');
    await redis('HDEL', KEY('pos'), id);
    await bump();
    await audit(me, 'hapus PO', stored.no);
    return json({ ok: true });
  });
}

export async function saveBarang(b: Record<string, unknown>, me: PublicUser) {
  const deny = needSupervisor(me, 'mengubah master barang');
  if (deny) return deny;
  const sku = clip(b.sku, 60);
  const nama = clip(b.nama, 120);
  if (!sku || !nama) return fail(400, 'SKU dan nama barang wajib diisi');
  if (!ID_RE.test(sku)) return fail(400, 'SKU berisi karakter yang tidak diizinkan');
  const isNew = !!b.baru;
  const prev = await getJSON<Barang>('barang', sku);
  if (isNew && prev) return fail(409, `SKU ${sku} sudah ada`);
  const min = b.minStok === '' || b.minStok == null ? undefined : Math.max(0, Number(b.minStok) || 0);
  const item: Barang = { sku, nama, barcode: clip(b.barcode, 60), satuan: clip(b.satuan, 20) || 'pcs', lokasi: clip(b.lokasi, 20) || undefined, minStok: min };
  if (item.barcode) {
    const dup = Object.values(await getAll<Barang>('barang')).find((x) => x.barcode === item.barcode && x.sku !== sku);
    if (dup) return fail(409, `Barcode ${item.barcode} sudah dipakai ${dup.nama}`);
  }
  await putJSON('barang', sku, item);
  // Samakan nama, satuan, dan lokasi di data stok.
  const meta = await getJSON<StockItem>('stok', sku);
  if (meta) await putJSON('stok', sku, { ...meta, nama: item.nama, satuan: item.satuan, lokasi: item.lokasi || meta.lokasi });
  await bump();
  await audit(me, prev ? 'ubah barang' : 'tambah barang', `${sku} ${nama}`);
  return json({ ok: true, barang: item });
}

export async function deleteBarang(b: Record<string, unknown>, me: PublicUser) {
  const deny = needSupervisor(me, 'menghapus master barang');
  if (deny) return deny;
  const sku = String(b.sku || '');
  const prev = ID_RE.test(sku) ? await getJSON<Barang>('barang', sku) : null;
  if (!prev) return fail(404, 'Barang tidak ditemukan');
  const qty = Number(await redis<string | null>('HGET', QTY_KEY, sku)) || Number((await getJSON<StockItem>('stok', sku))?.qty) || 0;
  if (qty > 0) return fail(409, `Stok ${prev.nama} masih ${qty}. Kosongkan stok dulu sebelum menghapus.`);
  const pos = Object.values(await getAll<PO>('pos')).map(normalizePO);
  if (pos.some((p) => (p.status === 'Terbuka' || p.status === 'Sebagian') && p.items.some((i) => i.sku === sku))) return fail(409, 'Barang ini masih ada di PO yang terbuka.');
  await redis('HDEL', KEY('barang'), sku);
  await bump();
  await audit(me, 'hapus barang', `${sku} ${prev.nama}`);
  return json({ ok: true });
}

export async function saveSupplier(b: Record<string, unknown>, me: PublicUser) {
  const deny = needSupervisor(me, 'mengubah master supplier');
  if (deny) return deny;
  const nama = clip(b.nama, 120);
  if (!nama) return fail(400, 'Nama supplier wajib diisi');
  const all = await getAll<Supplier>('supplier');
  let id = b.id ? String(b.id) : '';
  if (id && !all[id]) return fail(404, 'Supplier tidak ditemukan');
  if (Object.values(all).some((s) => s.id !== id && s.nama.toLowerCase() === nama.toLowerCase())) return fail(409, `Supplier ${nama} sudah ada`);
  if (!id) {
    id = slug(nama);
    for (let i = 2; all[id]; i++) id = `${slug(nama)}-${i}`;
  }
  const s: Supplier = { id, nama, kontak: clip(b.kontak, 80) || undefined, telepon: clip(b.telepon, 40) || undefined, alamat: clip(b.alamat, 300) || undefined };
  await putJSON('supplier', id, s);
  await bump();
  await audit(me, all[id] ? 'ubah supplier' : 'tambah supplier', nama);
  return json({ ok: true, supplier: s });
}

export async function deleteSupplier(b: Record<string, unknown>, me: PublicUser) {
  const deny = needSupervisor(me, 'menghapus master supplier');
  if (deny) return deny;
  const id = String(b.id || '');
  const prev = ID_RE.test(id) ? await getJSON<Supplier>('supplier', id) : null;
  if (!prev) return fail(404, 'Supplier tidak ditemukan');
  const pos = Object.values(await getAll<PO>('pos')).map(normalizePO);
  if (pos.some((p) => (p.status === 'Terbuka' || p.status === 'Sebagian') && p.supplier.toLowerCase() === prev.nama.toLowerCase())) return fail(409, 'Supplier ini masih punya PO yang terbuka.');
  await redis('HDEL', KEY('supplier'), id);
  await bump();
  await audit(me, 'hapus supplier', prev.nama);
  return json({ ok: true });
}
