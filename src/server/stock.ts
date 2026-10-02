// Barang keluar (Goods Issue) dan stok opname / penyesuaian stok.
import { audit, fail, json, parseHash, redis } from './core';
import { adjustStock, bump, clip, getAll, getJSON, ID_RE, isImage, newDocId, putJSON, QTY_KEY, takeStock, TTD_KEY, withLock } from './store';
import { fmt } from '@/lib/evaluate';
import { atLeast, JENIS_PENYESUAIAN, type Adjustment, type AdjustmentItem, type Barang, type GoodsIssue, type IssueItem, type PublicUser, type StockItem } from '@/lib/types';

async function itemInfo(sku: string) {
  const [meta, master] = await Promise.all([getJSON<StockItem>('stok', sku), getJSON<Barang>('barang', sku)]);
  if (!meta && !master) return null;
  return { nama: master?.nama || meta!.nama, satuan: master?.satuan || meta!.satuan };
}

export async function issueGoods(b: Record<string, unknown>, me: PublicUser) {
  const tujuan = clip(b.tujuan, 120);
  if (!tujuan) return fail(400, 'Isi tujuan barang keluar (pelanggan, cabang, atau departemen)');
  const raw = Array.isArray(b.items) ? (b.items as Record<string, unknown>[]) : [];
  const merged = new Map<string, number>();
  for (const r of raw) {
    const sku = String(r.sku || '');
    const qty = Number(r.qty);
    if (!ID_RE.test(sku) || !(qty > 0)) continue;
    merged.set(sku, (merged.get(sku) || 0) + qty);
  }
  if (!merged.size) return fail(400, 'Tambahkan minimal satu barang dengan jumlah lebih dari 0');
  const items: IssueItem[] = [];
  for (const [sku, qty] of merged) {
    const info = await itemInfo(sku);
    if (!info) return fail(400, `Barang ${sku} tidak dikenal`);
    items.push({ sku, nama: info.nama, satuan: info.satuan, qty });
  }
  if (b.ttd != null && b.ttd !== '' && !isImage(b.ttd)) return fail(400, 'Tanda tangan penerima tidak valid');

  const waktu = new Date().toISOString();
  const taken = await takeStock(items, waktu);
  if (!taken.ok) return fail(409, taken.error);
  const id = await newDocId('keluar', 'GI');
  const doc: GoodsIssue = { no: id, waktu, petugas: me.email, tujuan, referensi: clip(b.referensi, 80), catatan: clip(b.catatan, 1000), items, ttd: isImage(b.ttd) };
  if (doc.ttd) await redis('HSET', TTD_KEY, id, b.ttd as string);
  await putJSON('keluar', id, doc);
  await bump();
  await audit(me, 'barang keluar', `${id} ke ${tujuan}; stok ${taken.changes.join(', ')}`);
  return json({ ok: true, doc });
}

export async function createAdjustment(b: Record<string, unknown>, me: PublicUser) {
  const jenis = JENIS_PENYESUAIAN.find((j) => j === b.jenis);
  if (!jenis) return fail(400, 'Pilih jenis penyesuaian');
  const raw = Array.isArray(b.items) ? (b.items as Record<string, unknown>[]) : [];
  const qtys = parseHash<number>(await redis<string[]>('HGETALL', QTY_KEY));
  const metas = await getAll<StockItem>('stok');
  const items: AdjustmentItem[] = [];
  for (const r of raw) {
    const sku = String(r.sku || '');
    const fisik = Number(r.fisik);
    if (!ID_RE.test(sku) || !Number.isFinite(fisik) || fisik < 0) continue;
    const info = await itemInfo(sku);
    if (!info) return fail(400, `Barang ${sku} tidak dikenal`);
    const sistem = qtys[sku] != null ? Number(qtys[sku]) : Number(metas[sku]?.qty) || 0;
    const selisih = fisik - sistem;
    if (selisih !== 0) items.push({ sku, nama: info.nama, satuan: info.satuan, sistem, fisik, selisih });
  }
  if (!items.length) return fail(400, 'Tidak ada selisih. Isi jumlah fisik yang berbeda dari stok sistem.');
  const id = await newDocId('opname', 'ADJ');
  const doc: Adjustment = { no: id, waktu: new Date().toISOString(), petugas: me.email, jenis, catatan: clip(b.catatan, 1000), items, status: 'Menunggu' };
  await putJSON('opname', id, doc);
  await bump();
  await audit(me, 'buat penyesuaian stok', `${id} (${jenis}): ${items.map((i) => `${i.sku} ${i.selisih > 0 ? '+' : ''}${fmt(i.selisih)}`).join(', ')}`);
  if (b.setujui && atLeast(me.role, 'supervisor')) return decideAdjustment({ id, keputusan: 'setujui' }, me);
  return json({ ok: true, doc });
}

export async function decideAdjustment(b: Record<string, unknown>, me: PublicUser) {
  if (!atLeast(me.role, 'supervisor')) return fail(403, 'Hanya Supervisor atau Admin yang bisa menyetujui penyesuaian stok');
  const id = String(b.id || '');
  const setuju = b.keputusan === 'setujui';
  const alasan = clip(b.alasan, 300);
  if (!setuju && !alasan) return fail(400, 'Tulis alasan penolakan');
  return withLock(`adj:${id}`, async () => {
    const doc = ID_RE.test(id) ? await getJSON<Adjustment>('opname', id) : null;
    if (!doc) return fail(404, 'Penyesuaian tidak ditemukan');
    if (doc.status !== 'Menunggu') return fail(409, `Penyesuaian ini sudah ${doc.status.toLowerCase()}`);
    const waktu = new Date().toISOString();
    const changes: string[] = [];
    if (setuju) {
      for (const it of doc.items) {
        const after = await adjustStock(it.sku, it.nama, it.satuan, it.selisih, waktu);
        changes.push(`${it.sku} ${it.selisih > 0 ? '+' : ''}${fmt(it.selisih)} → ${fmt(after)} ${it.satuan}`);
      }
    }
    const next: Adjustment = { ...doc, status: setuju ? 'Disetujui' : 'Ditolak', diputusOleh: me.email, diputusWaktu: waktu, ...(setuju ? {} : { alasanTolak: alasan }) };
    await putJSON('opname', id, next);
    await bump();
    await audit(me, setuju ? 'setujui penyesuaian stok' : 'tolak penyesuaian stok', `${id}${setuju ? '; stok ' + changes.join(', ') : ': ' + alasan}`);
    return json({ ok: true, doc: next });
  });
}
