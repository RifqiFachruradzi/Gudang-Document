// Penerimaan barang (GRN) dengan pengiriman bertahap, dan persetujuan penerimaan yang ditahan.
import { audit, fail, json, redis } from './core';
import { addStock, APPROVE_KEY, bump, clip, getJSON, ID_RE, isImage, newDocId, putJSON, TTD_KEY, withLock } from './store';
import { evaluate, isOpenPO, normalizePO, statusAfter } from '@/lib/evaluate';
import { APPROVED, atLeast, type EvalRow, type GRN, type Keputusan, type PO, type PublicUser, type ReceiveInput, type Settings } from '@/lib/types';

function addReceived(po: ReturnType<typeof normalizePO>, rows: EvalRow[]) {
  const diterima = { ...po.diterima };
  for (const r of rows) if (r.baik > 0) diterima[r.sku] = (diterima[r.sku] || 0) + r.baik;
  return diterima;
}

export async function receive(b: Partial<ReceiveInput>, me: PublicUser) {
  const poId = String(b.poId || '');
  if (!ID_RE.test(poId)) return fail(400, 'PO tidak valid');
  if (!isImage(b.ttd)) return fail(400, 'Tanda tangan pengirim wajib diisi');

  // Satu penerimaan per PO pada satu waktu, supaya sisa PO selalu dihitung dari data terbaru.
  return withLock(`po:${poId}`, async () => {
    const stored = await getJSON<PO>('pos', poId);
    if (!stored) return fail(404, 'PO tidak ditemukan');
    const po = normalizePO(stored);
    if (!isOpenPO(po)) return fail(409, `PO ${po.no} berstatus ${po.status} dan tidak bisa menerima kiriman lagi.`);

    const cfg = await getJSON<Settings>('config', 'settings');
    const ev = evaluate(po, b, Number(cfg?.toleransi ?? 2));
    if (ev.rows.every((r) => r.fisik === 0)) return fail(400, 'Scan barang dulu sebelum menyimpan');
    const wantApprove = !!b.approved && ev.hasil === 'Ditahan';
    if (wantApprove && !atLeast(me.role, 'supervisor')) return fail(403, 'Hanya Supervisor atau Admin yang bisa menyetujui barang yang ditahan');
    const keputusan: Keputusan = ev.hasil === 'Ditahan' ? (wantApprove ? APPROVED : 'Ditahan') : ev.hasil;

    const waktu = new Date().toISOString();
    const id = await newDocId('grn', 'GRN');
    const g: GRN = {
      no: id, poId, poNo: po.no, supplier: po.supplier, waktu, petugas: me.email, hasil: ev.hasil, keputusan,
      items: ev.rows.filter((r) => r.status !== 'kosong'),
      unknown: (b.unknown || []).slice(0, 50).map((x) => clip(x, 60)), sjNo: clip(b.sjNo, 80), pengirim: clip(b.pengirim, 80),
      catatan: clip(b.catatan, 2000), inspeksi: (Array.isArray(b.inspeksi) ? b.inspeksi : []).slice(0, 10), ttd: true,
      ...(wantApprove ? { disetujuiOleh: me.email, disetujuiWaktu: waktu } : {}),
    };
    await redis('HSET', TTD_KEY, id, b.ttd!);
    await putJSON('grn', id, g);
    const accepted = keputusan !== 'Ditahan';
    if (wantApprove) await redis('HSET', APPROVE_KEY, id, me.email);
    const changes = accepted ? await addStock(g.items, waktu) : [];
    const diterima = accepted ? addReceived(po, g.items) : po.diterima;
    await putJSON('pos', poId, { ...po, diterima, grns: [...po.grns, id], grn: id, status: statusAfter(po, diterima) });
    await bump();
    await audit(me, 'buat penerimaan', `${id} (${po.no}): ${keputusan}${changes.length ? '; stok ' + changes.join(', ') : ''}`);
    return json({ ok: true, grn: g });
  });
}

export async function approveGRN(idRaw: unknown, me: PublicUser) {
  if (!atLeast(me.role, 'supervisor')) return fail(403, 'Hanya Supervisor atau Admin yang bisa menyetujui barang yang ditahan');
  const id = String(idRaw || '');
  const g = ID_RE.test(id) ? await getJSON<GRN>('grn', id) : null;
  if (!g) return fail(404, 'Penerimaan tidak ditemukan');
  if (g.keputusan !== 'Ditahan') return fail(409, 'Penerimaan ini tidak sedang ditahan');
  return withLock(`po:${g.poId}`, async () => {
    // Kunci persetujuan: stok hanya bertambah sekali walau tombol ditekan dua kali atau oleh dua orang.
    if (!(await redis<number>('HSETNX', APPROVE_KEY, id, me.email))) return fail(409, 'Penerimaan ini sudah disetujui');
    const waktu = new Date().toISOString();
    const ng: GRN = { ...g, keputusan: APPROVED, disetujuiOleh: me.email, disetujuiWaktu: waktu };
    await putJSON('grn', id, ng);
    const changes = await addStock(g.items, waktu);
    const stored = await getJSON<PO>('pos', g.poId);
    if (stored) {
      const po = normalizePO(stored);
      const diterima = addReceived(po, g.items);
      await putJSON('pos', g.poId, { ...po, diterima, grns: po.grns.includes(id) ? po.grns : [...po.grns, id], status: statusAfter(po, diterima) });
    }
    await bump();
    await audit(me, 'setujui penerimaan', `${id} (${g.poNo})${changes.length ? '; stok ' + changes.join(', ') : ''}`);
    return json({ ok: true, grn: ng });
  });
}
