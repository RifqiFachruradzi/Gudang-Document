import { requireUser, redis, audit, atLeast } from '../lib/common.js';

const COLS = ['pos', 'stok', 'grn', 'config'];
const KEY = (c) => `gudang:${c}`;
const QTY_KEY = 'gudang:stokqty'; // jumlah stok per SKU, diubah atomik dengan HINCRBYFLOAT
const TTD_KEY = 'gudang:ttd'; // gambar tanda tangan per GRN, dipisah agar sinkronisasi ringan
const CLAIM_KEY = 'gudang:poclaim'; // PO → GRN yang sudah menerimanya (cegah penerimaan ganda)
const APPROVE_KEY = 'gudang:approved'; // GRN ditahan → penyetuju (cegah persetujuan ganda)
const VER_KEY = 'gudang:ver'; // naik setiap ada perubahan; klien hanya mengunduh ulang bila berubah
const ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const APPROVED = 'Diterima, disetujui supervisor';

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
const getJSON = async (col, id) => { const r = await redis('HGET', KEY(col), id); return r ? JSON.parse(r) : null; };
const bump = () => redis('INCR', VER_KEY);
const num = (v) => Math.max(0, Number(v) || 0);
const fmt = (n) => new Intl.NumberFormat('id-ID').format(n || 0);

// Sama dengan aturan pencocokan di aplikasi, dihitung ulang di server agar hasil tidak bisa diakali.
function evaluate(po, input, tol) {
  const rows = po.items.map((it) => {
    const f = num(input.fisik?.[it.sku]), r = Math.min(num(input.rusak?.[it.sku]), f);
    const sjRaw = input.sj?.[it.sku];
    const sj = sjRaw === '' || sjRaw == null ? null : num(sjRaw);
    const baik = f - r, diff = baik - it.qty;
    const pct = it.qty ? Math.abs(diff) / it.qty * 100 : 0;
    const sjBeda = sj != null && sj !== f;
    const sjPct = sjBeda ? Math.abs(sj - f) / Math.max(f, 1) * 100 : 0;
    const notes = [];
    if (diff < 0) notes.push('Kurang ' + fmt(-diff));
    if (diff > 0) notes.push('Lebih ' + fmt(diff));
    if (r) notes.push(fmt(r) + ' rusak');
    if (sjBeda) notes.push('Surat jalan ' + fmt(sj) + ', fisik ' + fmt(f));
    const status = f === 0 ? 'belum' : diff === 0 && !sjBeda && r === 0 ? 'sesuai' : pct <= tol && sjPct <= tol ? 'catatan' : 'tahan';
    return { sku: it.sku, nama: it.nama, satuan: it.satuan, po: it.qty, sj, fisik: f, rusak: r, baik, status, notes };
  });
  const unk = (input.unknown || []).length;
  const hasil = rows.every((r) => r.status === 'sesuai') && !unk ? 'Diterima'
    : rows.some((r) => r.status === 'tahan' || r.status === 'belum') || unk ? 'Ditahan' : 'Diterima dengan catatan';
  return { rows, hasil };
}

// Tambah stok secara atomik. Data lama yang menyimpan jumlah di JSON dipindah sekali ke hash jumlah.
async function addStock(rows, waktu) {
  const metas = parseHash(await redis('HGETALL', KEY('stok')));
  const used = new Set(Object.values(metas).map((s) => s.lokasi));
  const nextLokasi = () => {
    for (const z of ['A', 'B', 'C', 'D']) for (let n = 1; n <= 20; n++) {
      const l = z + '-' + String(n).padStart(2, '0');
      if (!used.has(l)) { used.add(l); return l; }
    }
    return 'E-01';
  };
  const changes = [];
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

async function receive(req, res, me) {
  const b = req.body || {};
  const poId = String(b.poId || '');
  if (!ID_RE.test(poId)) return res.status(400).json({ error: 'PO tidak valid' });
  const po = await getJSON('pos', poId);
  if (!po) return res.status(404).json({ error: 'PO tidak ditemukan' });
  if (po.status === 'Diterima' || po.status === 'Ditahan')
    return res.status(409).json({ error: `PO ${po.no} sudah diterima (${po.grn || 'GRN tersimpan'}). Tidak bisa diterima dua kali.` });
  if (typeof b.ttd !== 'string' || !b.ttd.startsWith('data:image/') || b.ttd.length > 400 * 1024)
    return res.status(400).json({ error: 'Tanda tangan pengirim wajib diisi' });

  const cfg = await getJSON('config', 'settings');
  const tol = Number(cfg?.toleransi ?? 2);
  const ev = evaluate(po, b, tol);
  if (ev.rows.every((r) => r.fisik === 0)) return res.status(400).json({ error: 'Scan barang dulu sebelum menyimpan' });
  const wantApprove = !!b.approved && ev.hasil === 'Ditahan';
  if (wantApprove && !atLeast(me, 'supervisor')) return res.status(403).json({ error: 'Hanya Supervisor atau Admin yang bisa menyetujui barang yang ditahan' });
  const keputusan = ev.hasil === 'Ditahan' ? (wantApprove ? APPROVED : 'Ditahan') : ev.hasil;

  const d = new Date(), waktu = d.toISOString();
  let id = 'GRN-' + waktu.replace(/[-:T]/g, '').slice(0, 14);
  // Kunci PO: hanya satu penerimaan yang bisa mengklaimnya, walau dua petugas menyimpan bersamaan.
  if (!(await redis('HSETNX', CLAIM_KEY, poId, id))) {
    return res.status(409).json({ error: `PO ${po.no} baru saja diterima oleh petugas lain. Muat ulang halaman.` });
  }
  try {
    for (let i = 2; await redis('HEXISTS', KEY('grn'), id); i++) id = id.replace(/(-\d+)?$/, '') + '-' + i;
    if (id !== (await redis('HGET', CLAIM_KEY, poId))) await redis('HSET', CLAIM_KEY, poId, id);
    const clip = (v, n) => String(v || '').slice(0, n);
    const g = {
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
    return res.status(200).json({ ok: true, grn: g });
  } catch (e) {
    await redis('HDEL', CLAIM_KEY, poId).catch(() => {});
    throw e;
  }
}

async function approve(req, res, me) {
  if (!atLeast(me, 'supervisor')) return res.status(403).json({ error: 'Hanya Supervisor atau Admin yang bisa menyetujui barang yang ditahan' });
  const id = String(req.body?.id || '');
  const g = ID_RE.test(id) ? await getJSON('grn', id) : null;
  if (!g) return res.status(404).json({ error: 'Penerimaan tidak ditemukan' });
  if (g.keputusan !== 'Ditahan') return res.status(409).json({ error: 'Penerimaan ini tidak sedang ditahan' });
  // Kunci persetujuan: stok hanya bertambah sekali walau tombol ditekan dua kali atau oleh dua orang.
  if (!(await redis('HSETNX', APPROVE_KEY, id, me.email))) return res.status(409).json({ error: 'Penerimaan ini sudah disetujui' });
  const waktu = new Date().toISOString();
  const ng = { ...g, keputusan: APPROVED, disetujuiOleh: me.email, disetujuiWaktu: waktu };
  await redis('HSET', KEY('grn'), id, JSON.stringify(ng));
  const changes = await addStock(g.items, waktu);
  const po = await getJSON('pos', g.poId);
  if (po) await redis('HSET', KEY('pos'), g.poId, JSON.stringify({ ...po, status: 'Diterima', grn: id }));
  await bump();
  await audit(me, 'setujui penerimaan', `${id} (${g.poNo})${changes.length ? '; stok ' + changes.join(', ') : ''}`);
  return res.status(200).json({ ok: true, grn: ng });
}

export default async function handler(req, res) {
  const me = await requireUser(req, res);
  if (!me) return;
  try {
    if (req.method === 'GET') {
      // Tanda tangan satu GRN, diminta saat detail dibuka.
      if (req.query?.ttd) {
        const id = String(req.query.ttd);
        let ttd = await redis('HGET', TTD_KEY, id);
        if (!ttd) { const g = await getJSON('grn', id); ttd = typeof g?.ttd === 'string' ? g.ttd : null; }
        return res.status(200).json({ ttd });
      }
      const ver = Number(await redis('GET', VER_KEY)) || 0;
      if (req.query?.since != null && Number(req.query.since) === ver && ver > 0) return res.status(200).json({ ver, same: true });

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
      // Jumlah stok dari hash atomik; data lama tetap memakai jumlah di JSON.
      const qty = parseHash(await redis('HGETALL', QTY_KEY));
      for (const [sku, s] of Object.entries(out.stok)) if (qty[sku] != null) s.qty = Number(qty[sku]);
      // Pindahkan tanda tangan lama yang masih tersimpan di dalam GRN, lalu kirim GRN tanpa gambar.
      for (const [id, g] of Object.entries(out.grn)) {
        if (typeof g.ttd === 'string') {
          await redis('HSETNX', TTD_KEY, id, g.ttd);
          g.ttd = true;
          await redis('HSET', KEY('grn'), id, JSON.stringify(g));
        }
      }
      return res.status(200).json({ ...out, ver: ver || Number(await bump()) });
    }

    if (req.method === 'POST') {
      const action = req.body?.action;
      if (action === 'receive' || action === 'approve') {
        if (!atLeast(me, 'petugas')) return res.status(403).json({ error: 'Akun Viewer hanya bisa melihat data' });
        return action === 'receive' ? receive(req, res, me) : approve(req, res, me);
      }

      const { col, id } = req.body || {};
      const data = req.body?.data;
      if (!['pos', 'config'].includes(col))
        return res.status(400).json({ error: 'Penerimaan dan stok hanya bisa diubah lewat proses penerimaan' });
      if (!ID_RE.test(String(id)) || !data || typeof data !== 'object' || Array.isArray(data))
        return res.status(400).json({ error: 'Data tidak valid' });
      if (!atLeast(me, 'supervisor'))
        return res.status(403).json({ error: col === 'config' ? 'Hanya Supervisor atau Admin yang bisa mengubah aturan verifikasi' : 'Hanya Supervisor atau Admin yang bisa membuat atau mengubah PO' });
      const prev = await getJSON(col, id);
      const json = JSON.stringify(data);
      if (json.length > 256 * 1024) return res.status(400).json({ error: 'Data terlalu besar' });
      await redis('HSET', KEY(col), id, json);
      await bump();
      const detail = col === 'pos' ? `${id}: ${prev ? 'status ' + (prev.status || '-') + ' → ' + (data.status || '-') : 'dibuat'}` : `${id}: ${json.slice(0, 120)}`;
      await audit(me, `${prev ? 'ubah' : 'buat'} ${col === 'pos' ? 'PO' : 'pengaturan'}`, detail);
      return res.status(200).json({ ok: true, data });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Metode tidak didukung' });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
