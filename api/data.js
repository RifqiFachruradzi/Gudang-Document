import { requireUser, redis, audit, atLeast } from '../lib/common.js';

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
  const me = await requireUser(req, res);
  if (!me) return;
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
      const { col, id } = req.body || {};
      let data = req.body?.data;
      if (!COLS.includes(col) || !ID_RE.test(String(id)) || !data || typeof data !== 'object' || Array.isArray(data))
        return res.status(400).json({ error: 'Data tidak valid' });
      const prevRaw = await redis('HGET', KEY(col), id);
      const prev = prevRaw ? JSON.parse(prevRaw) : null;
      const deny = (msg) => res.status(403).json({ error: msg });

      // Aturan peran, dicek di server agar tidak bisa dilewati dari browser.
      if (!atLeast(me, 'petugas')) return deny('Akun Viewer hanya bisa melihat data');
      if (col === 'config' && !atLeast(me, 'supervisor')) return deny('Hanya Supervisor atau Admin yang bisa mengubah aturan verifikasi');
      if (col === 'pos' && !atLeast(me, 'supervisor')) {
        // Petugas hanya boleh memperbarui status PO saat menyimpan penerimaan.
        const same = prev && JSON.stringify({ ...prev, status: 0, grn: 0 }) === JSON.stringify({ ...data, status: 0, grn: 0 });
        if (!same) return deny('Hanya Supervisor atau Admin yang bisa membuat atau mengubah PO');
      }
      if (col === 'grn') {
        const approved = data.keputusan === 'Diterima, disetujui supervisor';
        if (approved && !atLeast(me, 'supervisor')) return deny('Hanya Supervisor atau Admin yang bisa menyetujui barang yang ditahan');
        if (prev) {
          // GRN yang sudah tersimpan tidak bisa diubah, kecuali supervisor menyetujui GRN yang ditahan.
          if (!(prev.keputusan === 'Ditahan' && approved && atLeast(me, 'supervisor')))
            return deny('Bukti penerimaan (GRN) yang sudah tersimpan tidak bisa diubah');
          data = { ...prev, keputusan: data.keputusan, disetujuiOleh: me.email, disetujuiWaktu: new Date().toISOString() };
        } else {
          data = { ...data, petugas: me.email, ...(approved ? { disetujuiOleh: me.email, disetujuiWaktu: new Date().toISOString() } : {}) };
        }
      }

      const json = JSON.stringify(data);
      if (json.length > 256 * 1024) return res.status(400).json({ error: 'Data terlalu besar' });
      await redis('HSET', KEY(col), id, json);
      const label = { pos: 'PO', stok: 'stok', grn: 'penerimaan', config: 'pengaturan' }[col];
      const detail = col === 'stok' ? `${id}: ${prev ? prev.qty : 0} → ${data.qty} ${data.satuan || ''}`.trim()
        : col === 'grn' ? `${id} (${data.poNo}): ${data.keputusan}`
        : col === 'pos' ? `${id}: ${prev ? 'status ' + (prev.status || '-') + ' → ' + (data.status || '-') : 'dibuat'}`
        : `${id}: ${json.slice(0, 120)}`;
      await audit(me, `${prev ? 'ubah' : 'buat'} ${label}`, detail);
      return res.status(200).json({ ok: true, data });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Metode tidak didukung' });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
