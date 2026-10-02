import { checkAuth, redis } from '../lib/common.js';

const COLS = ['pos', 'stok', 'grn', 'config'];
const KEY = (c) => `gudang:${c}`;
const ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

const DEMO = {
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

function parseHash(arr) {
  const o = {};
  for (let i = 0; i < (arr || []).length; i += 2) {
    try { o[arr[i]] = JSON.parse(arr[i + 1]); } catch (e) {}
  }
  return o;
}

export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  try {
    if (req.method === 'GET') {
      const out = {};
      for (const c of COLS) out[c] = parseHash(await redis('HGETALL', KEY(c)));
      // Isi data contoh hanya sekali, saat database masih kosong dan SEED_DEMO tidak dimatikan.
      const empty = COLS.every((c) => !Object.keys(out[c]).length);
      if (empty && process.env.SEED_DEMO !== 'false') {
        for (const c of Object.keys(DEMO)) for (const [id, d] of Object.entries(DEMO[c])) {
          await redis('HSET', KEY(c), id, JSON.stringify(d));
          out[c][id] = d;
        }
      }
      return res.status(200).json(out);
    }
    if (req.method === 'POST') {
      const { col, id, data } = req.body || {};
      if (!COLS.includes(col) || !ID_RE.test(String(id)) || !data || typeof data !== 'object')
        return res.status(400).json({ error: 'Data tidak valid' });
      const json = JSON.stringify(data);
      if (json.length > 256 * 1024) return res.status(400).json({ error: 'Data terlalu besar' });
      await redis('HSET', KEY(col), id, json);
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Metode tidak didukung' });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
