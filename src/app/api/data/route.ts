import { audit, body, fail, handle, json, parseHash, redis, requireUser } from '@/server/core';
import { evaluate, fmt } from '@/lib/evaluate';
import { APPROVED, atLeast, type EvalRow, type GRN, type Keputusan, type PO, type PublicUser, type ReceiveInput, type Settings, type StockItem } from '@/lib/types';

const COLS = ['pos', 'stok', 'grn', 'config'] as const;
const KEY = (c: string) => `gudang:${c}`;
const QTY_KEY = 'gudang:stokqty'; // jumlah stok per SKU, diubah atomik dengan HINCRBYFLOAT
const TTD_KEY = 'gudang:ttd'; // gambar tanda tangan per GRN, dipisah agar sinkronisasi ringan
const CLAIM_KEY = 'gudang:poclaim'; // PO → GRN yang menerimanya (cegah penerimaan ganda)
const APPROVE_KEY = 'gudang:approved'; // GRN ditahan → penyetuju (cegah persetujuan ganda)
const VER_KEY = 'gudang:ver'; // naik setiap ada perubahan; klien hanya mengunduh ulang bila berubah
const ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

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
};

async function getJSON<T>(col: string, id: string): Promise<T | null> {
  const r = await redis<string | null>('HGET', KEY(col), id);
  return r ? (JSON.parse(r) as T) : null;
}
const bump = () => redis<number>('INCR', VER_KEY);

// Tambah stok secara atomik. Data lama yang menyimpan jumlah di JSON dipindah sekali ke hash jumlah.
async function addStock(rows: EvalRow[], waktu: string) {
  const metas = parseHash<StockItem>(await redis('HGETALL', KEY('stok')));
  const used = new Set(Object.values(metas).map((s) => s.lokasi));
  const nextLokasi = () => {
    for (const z of ['A', 'B', 'C', 'D']) for (let n = 1; n <= 20; n++) {
      const l = z + '-' + String(n).padStart(2, '0');
      if (!used.has(l)) { used.add(l); return l; }
    }
    return 'E-01';
  };
  const changes: string[] = [];
  for (const r of rows) {
    if (r.baik <= 0) continue;
    const meta = metas[r.sku];
    await redis('HSETNX', QTY_KEY, r.sku, String(Number(meta?.qty) || 0));
    const after = Number(await redis('HINCRBYFLOAT', QTY_KEY, r.sku, String(r.baik)));
    await redis('HSET', KEY('stok'), r.sku, JSON.stringify({ sku: r.sku, nama: r.nama, satuan: r.satuan, lokasi: meta?.lokasi || nextLokasi(), update: waktu }));
    changes.push(`${r.sku} +${fmt(r.baik)} → ${fmt(after)} ${r.satuan}`);
  }
  return changes;
}

async function receive(b: Partial<ReceiveInput>, me: PublicUser) {
  const poId = String(b.poId || '');
  if (!ID_RE.test(poId)) return fail(400, 'PO tidak valid');
  const po = await getJSON<PO>('pos', poId);
  if (!po) return fail(404, 'PO tidak ditemukan');
  if (po.status === 'Diterima' || po.status === 'Ditahan')
    return fail(409, `PO ${po.no} sudah diterima (${po.grn || 'GRN tersimpan'}). Tidak bisa diterima dua kali.`);
  if (typeof b.ttd !== 'string' || !b.ttd.startsWith('data:image/') || b.ttd.length > 400 * 1024) return fail(400, 'Tanda tangan pengirim wajib diisi');

  const cfg = await getJSON<Settings>('config', 'settings');
  const ev = evaluate(po, b, Number(cfg?.toleransi ?? 2));
  if (ev.rows.every((r) => r.fisik === 0)) return fail(400, 'Scan barang dulu sebelum menyimpan');
  const wantApprove = !!b.approved && ev.hasil === 'Ditahan';
  if (wantApprove && !atLeast(me.role, 'supervisor')) return fail(403, 'Hanya Supervisor atau Admin yang bisa menyetujui barang yang ditahan');
  const keputusan: Keputusan = ev.hasil === 'Ditahan' ? (wantApprove ? APPROVED : 'Ditahan') : ev.hasil;

  const waktu = new Date().toISOString();
  let id = 'GRN-' + waktu.replace(/[-:T]/g, '').slice(0, 14);
  // Kunci PO: hanya satu penerimaan yang bisa mengklaimnya, walau dua petugas menyimpan bersamaan.
  if (!(await redis<number>('HSETNX', CLAIM_KEY, poId, id))) return fail(409, `PO ${po.no} baru saja diterima oleh petugas lain. Muat ulang halaman.`);
  try {
    for (let i = 2; await redis<number>('HEXISTS', KEY('grn'), id); i++) id = id.replace(/(-\d+)?$/, '') + '-' + i;
    await redis('HSET', CLAIM_KEY, poId, id);
    const clip = (v: unknown, n: number) => String(v || '').slice(0, n);
    const g: GRN = {
      no: id, poId, poNo: po.no, supplier: po.supplier, waktu, petugas: me.email, hasil: ev.hasil, keputusan, items: ev.rows,
      unknown: (b.unknown || []).slice(0, 50).map((x) => clip(x, 60)), sjNo: clip(b.sjNo, 80), pengirim: clip(b.pengirim, 80),
      catatan: clip(b.catatan, 2000), inspeksi: (Array.isArray(b.inspeksi) ? b.inspeksi : []).slice(0, 10), ttd: true,
      ...(wantApprove ? { disetujuiOleh: me.email, disetujuiWaktu: waktu } : {}),
    };
    await redis('HSET', TTD_KEY, id, b.ttd);
    await redis('HSET', KEY('grn'), id, JSON.stringify(g));
    const accepted = keputusan !== 'Ditahan';
    if (wantApprove) await redis('HSET', APPROVE_KEY, id, me.email);
    const changes = accepted ? await addStock(ev.rows, waktu) : [];
    await redis('HSET', KEY('pos'), poId, JSON.stringify({ ...po, status: accepted ? 'Diterima' : 'Ditahan', grn: id }));
    await bump();
    await audit(me, 'buat penerimaan', `${id} (${po.no}): ${keputusan}${changes.length ? '; stok ' + changes.join(', ') : ''}`);
    return json({ ok: true, grn: g });
  } catch (e) {
    await redis('HDEL', CLAIM_KEY, poId).catch(() => {});
    throw e;
  }
}

async function approve(idRaw: unknown, me: PublicUser) {
  if (!atLeast(me.role, 'supervisor')) return fail(403, 'Hanya Supervisor atau Admin yang bisa menyetujui barang yang ditahan');
  const id = String(idRaw || '');
  const g = ID_RE.test(id) ? await getJSON<GRN>('grn', id) : null;
  if (!g) return fail(404, 'Penerimaan tidak ditemukan');
  if (g.keputusan !== 'Ditahan') return fail(409, 'Penerimaan ini tidak sedang ditahan');
  // Kunci persetujuan: stok hanya bertambah sekali walau tombol ditekan dua kali atau oleh dua orang.
  if (!(await redis<number>('HSETNX', APPROVE_KEY, id, me.email))) return fail(409, 'Penerimaan ini sudah disetujui');
  const waktu = new Date().toISOString();
  const ng: GRN = { ...g, keputusan: APPROVED, disetujuiOleh: me.email, disetujuiWaktu: waktu };
  await redis('HSET', KEY('grn'), id, JSON.stringify(ng));
  const changes = await addStock(g.items, waktu);
  const po = await getJSON<PO>('pos', g.poId);
  if (po) await redis('HSET', KEY('pos'), g.poId, JSON.stringify({ ...po, status: 'Diterima', grn: id }));
  await bump();
  await audit(me, 'setujui penerimaan', `${id} (${g.poNo})${changes.length ? '; stok ' + changes.join(', ') : ''}`);
  return json({ ok: true, grn: ng });
}

export const GET = handle(async (req) => {
  const me = await requireUser(req);
  if (me instanceof Response) return me;
  const q = new URL(req.url).searchParams;

  // Tanda tangan satu GRN, diminta saat detail dibuka.
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
    for (const c of Object.keys(DEMO)) for (const [id, d] of Object.entries(DEMO[c])) {
      await redis('HSET', KEY(c), id, JSON.stringify(d));
      out[c][id] = d;
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
      await redis('HSET', KEY('grn'), id, JSON.stringify(g));
    }
  }
  return json({ ...out, ver: ver || Number(await bump()) });
});

export const POST = handle(async (req) => {
  const me = await requireUser(req);
  if (me instanceof Response) return me;
  const b = await body<Record<string, unknown>>(req);

  if (b.action === 'receive' || b.action === 'approve') {
    if (!atLeast(me.role, 'petugas')) return fail(403, 'Akun Viewer hanya bisa melihat data');
    return b.action === 'receive' ? receive(b as Partial<ReceiveInput>, me) : approve(b.id, me);
  }

  const col = String(b.col || '');
  const id = String(b.id || '');
  const data = b.data;
  if (col !== 'pos' && col !== 'config') return fail(400, 'Penerimaan dan stok hanya bisa diubah lewat proses penerimaan');
  if (!ID_RE.test(id) || !data || typeof data !== 'object' || Array.isArray(data)) return fail(400, 'Data tidak valid');
  if (!atLeast(me.role, 'supervisor'))
    return fail(403, col === 'config' ? 'Hanya Supervisor atau Admin yang bisa mengubah aturan verifikasi' : 'Hanya Supervisor atau Admin yang bisa membuat atau mengubah PO');
  const prev = await getJSON<PO>(col, id);
  const s = JSON.stringify(data);
  if (s.length > 256 * 1024) return fail(400, 'Data terlalu besar');
  await redis('HSET', KEY(col), id, s);
  await bump();
  const detail = col === 'pos' ? `${id}: ${prev ? 'status ' + (prev.status || '-') + ' → ' + ((data as PO).status || '-') : 'dibuat'}` : `${id}: ${s.slice(0, 120)}`;
  await audit(me, `${prev ? 'ubah' : 'buat'} ${col === 'pos' ? 'PO' : 'pengaturan'}`, detail);
  return json({ ok: true, data });
});
