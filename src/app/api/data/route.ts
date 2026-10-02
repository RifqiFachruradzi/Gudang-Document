import { audit, body, fail, handle, json, parseHash, redis, requireUser } from '@/server/core';
import { bump, COLS, getJSON, KEY, putJSON, QTY_KEY, TTD_KEY, VER_KEY } from '@/server/store';
import { approveGRN, receive } from '@/server/receiving';
import { closePO, deleteBarang, deletePO, deleteSupplier, saveBarang, savePO, saveSupplier } from '@/server/purchase';
import { createAdjustment, decideAdjustment, issueGoods } from '@/server/stock';
import { atLeast, type Barang, type GRN, type PO, type PublicUser, type ReceiveInput, type Settings, type StockItem, type Supplier } from '@/lib/types';

const DEMO: Record<string, Record<string, unknown>> = {
  config: { settings: { toleransi: 2 } },
  pos: {
    'PO-2026-0001': { no: 'PO-2026-0001', supplier: 'PT Sumber Pangan Nusantara', tanggal: '2026-09-28', status: 'Terbuka', items: [
      { sku: 'BRS-PW-5', barcode: '8991001000051', nama: 'Beras Pandan Wangi 5 kg', qty: 40, satuan: 'sak' },
      { sku: 'MYK-2L', barcode: '8991001000204', nama: 'Minyak Goreng 2 liter', qty: 60, satuan: 'pouch' },
      { sku: 'GLA-1K', barcode: '8991001000013', nama: 'Gula Pasir 1 kg', qty: 100, satuan: 'pack' } ] },
    'PO-2026-0002': { no: 'PO-2026-0002', supplier: 'CV Maju Plastik', tanggal: '2026-09-30', status: 'Terbuka', items: [
      { sku: 'KRD-M', barcode: '8992002000017', nama: 'Kardus ukuran M', qty: 200, satuan: 'pcs' },
      { sku: 'LKB-48', barcode: '8992002000048', nama: 'Lakban bening 48 mm', qty: 50, satuan: 'roll' } ] },
  },
  barang: {
    'BRS-PW-5': { sku: 'BRS-PW-5', barcode: '8991001000051', nama: 'Beras Pandan Wangi 5 kg', satuan: 'sak', lokasi: 'A-01', minStok: 10 },
    'MYK-2L': { sku: 'MYK-2L', barcode: '8991001000204', nama: 'Minyak Goreng 2 liter', satuan: 'pouch', lokasi: 'A-02', minStok: 20 },
    'GLA-1K': { sku: 'GLA-1K', barcode: '8991001000013', nama: 'Gula Pasir 1 kg', satuan: 'pack', lokasi: 'A-03', minStok: 30 },
    'KRD-M': { sku: 'KRD-M', barcode: '8992002000017', nama: 'Kardus ukuran M', satuan: 'pcs', lokasi: 'B-01', minStok: 50 },
    'LKB-48': { sku: 'LKB-48', barcode: '8992002000048', nama: 'Lakban bening 48 mm', satuan: 'roll', lokasi: 'B-02', minStok: 10 },
  },
  supplier: {
    'pt-sumber-pangan-nusantara': { id: 'pt-sumber-pangan-nusantara', nama: 'PT Sumber Pangan Nusantara', kontak: 'Bu Rina', telepon: '021-5550123' },
    'cv-maju-plastik': { id: 'cv-maju-plastik', nama: 'CV Maju Plastik', kontak: 'Pak Andi', telepon: '021-5550456' },
  },
};

export const GET = handle(async (req) => {
  const me = await requireUser(req);
  if (me instanceof Response) return me;
  const q = new URL(req.url).searchParams;

  // Tanda tangan satu dokumen (GRN atau barang keluar), diminta saat detail dibuka.
  const ttdId = q.get('ttd');
  if (ttdId) {
    let ttd = await redis<string | null>('HGET', TTD_KEY, ttdId);
    if (!ttd) {
      const g = await getJSON<GRN>('grn', ttdId);
      ttd = typeof g?.ttd === 'string' ? g.ttd : null;
    }
    return json({ ttd });
  }

  const ver = Number(await redis('GET', VER_KEY)) || 0;
  const since = q.get('since');
  if (since != null && Number(since) === ver && ver > 0) return json({ ver, same: true });

  const out: Record<string, Record<string, unknown>> = {};
  for (const c of COLS) out[c] = parseHash(await redis('HGETALL', KEY(c)));
  // Isi data contoh hanya sekali, saat database masih kosong dan SEED_DEMO tidak dimatikan.
  if (COLS.every((c) => !Object.keys(out[c]).length) && process.env.SEED_DEMO !== 'false') {
    for (const c of Object.keys(DEMO) as (keyof typeof DEMO)[]) for (const [id, d] of Object.entries(DEMO[c])) {
      await putJSON(c as (typeof COLS)[number], id, d);
      out[c][id] = d;
    }
  }
  // Database lama belum punya master data: isi sekali dari PO dan stok yang sudah ada.
  if (!Object.keys(out.barang).length && (Object.keys(out.pos).length || Object.keys(out.stok).length)) {
    const seen: Record<string, Barang> = {};
    for (const p of Object.values(out.pos as Record<string, PO>)) for (const i of p.items) seen[i.sku] ||= { sku: i.sku, barcode: i.barcode, nama: i.nama, satuan: i.satuan };
    for (const s of Object.values(out.stok as Record<string, StockItem>)) seen[s.sku] = { ...(seen[s.sku] || { barcode: '' }), sku: s.sku, nama: s.nama, satuan: s.satuan, lokasi: s.lokasi };
    for (const b of Object.values(seen)) { await redis('HSETNX', KEY('barang'), b.sku, JSON.stringify(b)); out.barang[b.sku] = b; }
  }
  if (!Object.keys(out.supplier).length && Object.keys(out.pos).length) {
    for (const nama of new Set(Object.values(out.pos as Record<string, PO>).map((p) => p.supplier))) {
      const id = nama.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'supplier';
      const sp: Supplier = { id, nama };
      await redis('HSETNX', KEY('supplier'), id, JSON.stringify(sp));
      out.supplier[id] = sp;
    }
  }
  // Jumlah stok dari hash atomik; data lama tetap memakai jumlah di JSON.
  const qty = parseHash<number>(await redis('HGETALL', QTY_KEY));
  for (const [sku, s] of Object.entries(out.stok as Record<string, StockItem>)) if (qty[sku] != null) s.qty = Number(qty[sku]);
  // Pindahkan tanda tangan lama yang masih tersimpan di dalam GRN, lalu kirim GRN tanpa gambar.
  for (const [id, g] of Object.entries(out.grn as Record<string, GRN>)) {
    if (typeof g.ttd === 'string') {
      await redis('HSETNX', TTD_KEY, id, g.ttd);
      g.ttd = true;
      await putJSON('grn', id, g);
    }
  }
  return json({ ...out, ver: ver || Number(await bump()) });
});

type Action = (b: Record<string, unknown>, me: PublicUser) => Promise<Response>;
const ACTIONS: Record<string, { min: 'petugas' | 'supervisor'; run: Action }> = {
  receive: { min: 'petugas', run: (b, me) => receive(b as Partial<ReceiveInput>, me) },
  approve: { min: 'petugas', run: (b, me) => approveGRN(b.id, me) },
  po_save: { min: 'petugas', run: savePO },
  po_close: { min: 'petugas', run: closePO },
  po_delete: { min: 'petugas', run: deletePO },
  barang_save: { min: 'petugas', run: saveBarang },
  barang_delete: { min: 'petugas', run: deleteBarang },
  supplier_save: { min: 'petugas', run: saveSupplier },
  supplier_delete: { min: 'petugas', run: deleteSupplier },
  issue: { min: 'petugas', run: issueGoods },
  adjust_create: { min: 'petugas', run: createAdjustment },
  adjust_decide: { min: 'petugas', run: decideAdjustment },
  settings: {
    min: 'supervisor',
    run: async (b, me) => {
      const tol = Math.max(0, Math.min(50, Number(b.toleransi) || 0));
      const prev = await getJSON<Settings>('config', 'settings');
      await putJSON('config', 'settings', { ...(prev || {}), toleransi: tol });
      await bump();
      await audit(me, 'ubah pengaturan', `toleransi ${prev?.toleransi ?? 2}% → ${tol}%`);
      return json({ ok: true });
    },
  },
};

export const POST = handle(async (req) => {
  const me = await requireUser(req);
  if (me instanceof Response) return me;
  const b = await body<Record<string, unknown>>(req);
  const a = ACTIONS[String(b.action || '')];
  if (!a) return fail(400, 'Aksi tidak dikenal');
  if (!atLeast(me.role, a.min)) return fail(403, a.min === 'petugas' ? 'Akun Viewer hanya bisa melihat data' : 'Hanya Supervisor atau Admin yang bisa melakukan ini');
  return a.run(b, me);
});
