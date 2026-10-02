'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ImagePlus, Send, Square, X } from 'lucide-react';
import { sample, IMAGE_TYPES, MAX_IMAGE_BYTES, type AiTool } from '@/lib/ai';
import { ApiError } from '@/lib/client';
import { fmt, normalizePO } from '@/lib/evaluate';
import { stockRows } from '@/lib/stock-view';
import { useApp } from './app-provider';
import { cn, Mascot } from './ui';

interface ChartData { judul: string; satuan: string; data: { label: string; nilai: number }[] }
interface ChatMsg { role: 'user' | 'assistant'; content: string; img?: string; charts?: ChartData[] }

const SUGG = ['Cara pakai aplikasi ini gimana?', 'Ringkas kondisi gudang hari ini', 'Grafik stok per barang', 'Supplier mana yang paling sering bermasalah?'];
const GUIDE = `Menu "Beranda": ringkasan PO menunggu, hal yang perlu persetujuan, penerimaan hari ini, dan stok menipis. Menu "Terima barang": pilih PO yang masih terbuka, lalu (1) foto surat jalan atau tempel teksnya supaya AI mengisi jumlah surat jalan, (2) scan barcode/SKU barang fisik lalu Enter (kolom kecil = jumlah per scan, untuk karton), opsional foto kondisi barang untuk dicek AI, (3) lihat tabel: sisa PO vs surat jalan vs fisik vs rusak dan keputusan otomatis (Diterima, Diterima dengan catatan, Ditahan), (4) tanda tangan pengirim lalu Simpan. Pengiriman bertahap didukung: kiriman yang lebih sedikit dari sisa PO diterima normal dan PO tetap terbuka (status "Diterima sebagian") sampai lengkap. Ditahan bila selisih dengan surat jalan, kelebihan dari sisa PO, atau barang rusak melebihi toleransi, atau ada kode di luar PO; Supervisor/Admin menyetujuinya dari menu Riwayat. Menu "Barang keluar": catat pengiriman ke pelanggan/cabang/pemakaian internal, scan atau pilih barang, stok langsung berkurang dan tidak bisa minus; bisa dicetak sebagai surat jalan. Menu "Stok opname": hitung fisik atau catat barang rusak/hilang; selisih mengubah stok setelah disetujui Supervisor/Admin. Menu "Purchase order": buat, ubah (sebelum ada penerimaan), batalkan, tutup sisa, atau hapus PO (Supervisor/Admin), lihat progres penerimaan per PO, atur toleransi selisih. Menu "Stok": stok real-time per rak, filter stok menipis, ketuk barang untuk kartu stok (riwayat masuk/keluar/penyesuaian). Menu "Riwayat penerimaan": daftar GRN, filter Ditahan, detail, cetak/PDF, CSV. Menu "Master data": barang (SKU, barcode, satuan, rak, stok minimum) dan supplier; barang/supplier baru dari PO otomatis masuk. Menu "Admin": setujui akun baru, ubah peran, log audit. Peran: Viewer (lihat saja), Petugas, Supervisor, Admin.`;
const ROUTES: Record<string, string> = { beranda: '/', terima: '/terima', keluar: '/keluar', opname: '/opname', po: '/po', stok: '/stok', riwayat: '/riwayat', master: '/master' };

// Format sederhana untuk jawaban AI: paragraf, daftar, dan teks tebal.
function Markdown({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const inline = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <Fragment key={i}>{p}</Fragment>));
  const flush = () => {
    if (list.length) out.push(<ul key={out.length} className="my-1 list-disc pl-5">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split('\n')) {
    const l = raw.replace(/^#+\s*/, '');
    const m = l.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)/);
    if (m) list.push(m[1]);
    else {
      flush();
      if (l.trim()) out.push(<p key={out.length} className="mb-1.5 last:mb-0">{inline(l)}</p>);
    }
  }
  flush();
  return <>{out}</>;
}

function Chart({ c }: { c: ChartData }) {
  const max = Math.max(...c.data.map((d) => d.nilai), 1);
  return (
    <div className="mt-2 rounded-lg border border-line bg-panel p-2.5">
      <h4 className="mb-2 text-base font-semibold">{c.judul}</h4>
      {c.data.map((d, i) => (
        <div key={i} className="my-1 grid grid-cols-[minmax(70px,38%)_1fr_auto] items-center gap-2 text-[13px]">
          <span className="truncate">{d.label}</span>
          <i className="block h-3.5 rounded-sm bg-accent" style={{ width: `${Math.max(2, (d.nilai / max) * 100)}%` }} />
          <span className="tabular-nums">{fmt(d.nilai)}{c.satuan ? ' ' + c.satuan : ''}</span>
        </div>
      ))}
    </div>
  );
}

export function Gudi() {
  const { me, data, tol, screen, toast } = useApp();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [q, setQ] = useState('');
  const ctl = useRef<AbortController | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [chat]);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); fabRef.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function context() {
    const d = data;
    if (!d) return {};
    return {
      hari_ini: new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      toleransi_persen: tol,
      layar: { halaman: path, ...screen },
      po: Object.values(d.pos).map(normalizePO).map((p) => ({ no: p.no, supplier: p.supplier, tanggal: p.tanggal, status: p.status, barang: p.items.map((i) => `${i.nama} (${i.sku}) dipesan ${i.qty}, diterima ${p.diterima[i.sku] || 0} ${i.satuan}`) })),
      stok: stockRows(d).map((s) => ({ sku: s.sku, nama: s.nama, qty: s.qty, satuan: s.satuan, lokasi: s.lokasi, stok_minimum: s.minStok, menipis: s.menipis, diperbarui: s.update })),
      supplier: Object.values(d.supplier).map((s) => ({ nama: s.nama, kontak: s.kontak, telepon: s.telepon })),
      barang_keluar: Object.values(d.keluar).sort((a, b) => b.waktu.localeCompare(a.waktu)).slice(0, 30).map((k) => ({ no: k.no, waktu: k.waktu, tujuan: k.tujuan, barang: k.items.map((i) => `${i.nama} ${i.qty} ${i.satuan}`) })),
      penyesuaian_stok: Object.values(d.opname).sort((a, b) => b.waktu.localeCompare(a.waktu)).slice(0, 20).map((a) => ({ no: a.no, waktu: a.waktu, jenis: a.jenis, status: a.status, selisih: a.items.map((i) => `${i.nama} ${i.selisih}`) })),
      penerimaan_grn: Object.values(d.grn)
        .sort((a, b) => b.waktu.localeCompare(a.waktu))
        .slice(0, 40)
        .map((g) => ({ no: g.no, po: g.poNo, supplier: g.supplier, waktu: g.waktu, hasil: g.hasil, keputusan: g.keputusan, selisih: g.items.filter((r) => r.status !== 'sesuai').map((r) => r.nama + ': ' + r.notes.join(', ')), inspeksi_foto: (g.inspeksi || []).map((x) => x.kondisi) })),
    };
  }

  async function send(textIn: string) {
    let text = textIn.trim();
    if (busy || (!text && !file)) return;
    if (!text) text = 'Tolong jelaskan foto ini.';
    const f = file;
    setFile(null);
    setQ('');
    const history = chat.filter((m) => m.content).slice(-10).map((m) => ({ role: m.role, content: m.content }));
    const idx = chat.length + 1;
    setChat((c) => [...c, { role: 'user', content: text, img: f?.name }, { role: 'assistant', content: '', charts: [] }]);
    setBusy(true);
    ctl.current = new AbortController();
    const instr = `Kamu adalah Gudi, asisten AI yang ramah di aplikasi gudang "Gudang tanpa kertas". Jawab dalam bahasa Indonesia yang santai tapi sopan, singkat dan langsung ke inti, pakai poin jika membantu. Gunakan hanya data di bawah; jangan mengarang angka. Jika data yang ditanya tidak ada, katakan terus terang dan sarankan langkahnya. Jika pengguna meminta grafik atau perbandingan angka, panggil alat tampilkan_grafik lalu beri ringkasan singkat. Jika pengguna ingin membuka menu tertentu, panggil buka_menu.
Nama pengguna: ${me.name}. Peran: ${me.role}.
PANDUAN APLIKASI: ${GUIDE}
DATA GUDANG SAAT INI (JSON): ${JSON.stringify(context())}
${f ? 'Pengguna melampirkan satu foto (terlampir). Jelaskan isinya dalam konteks gudang bila relevan.' : ''}
PESAN PENGGUNA: ${text}`;
    const turns: { role: 'user' | 'assistant'; content: string }[] = [];
    for (const m of [...history, { role: 'user' as const, content: instr }]) {
      const last = turns[turns.length - 1];
      if (last && last.role === m.role) last.content += '\n\n' + m.content;
      else turns.push({ ...m });
    }
    while (turns.length && turns[0].role !== 'user') turns.shift();
    const patch = (fn: (m: ChatMsg) => ChatMsg) => setChat((c) => c.map((m, i) => (i === idx ? fn(m) : m)));
    const tools: AiTool[] = [
      {
        name: 'tampilkan_grafik',
        description: 'Menampilkan grafik batang di dalam chat. Pakai saat pengguna meminta grafik atau perbandingan angka. Mengembalikan "ok".',
        inputSchema: { type: 'object', properties: { judul: { type: 'string' }, satuan: { type: 'string' }, data: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, nilai: { type: 'number' } }, required: ['label', 'nilai'] } } }, required: ['judul', 'data'] },
        execute(inp) {
          const rows = (Array.isArray(inp.data) ? inp.data : []).slice(0, 20).map((d: { label?: unknown; nilai?: unknown }) => ({ label: String(d?.label ?? ''), nilai: Number(d?.nilai) || 0 }));
          if (!rows.length) throw new Error('data grafik kosong');
          patch((m) => ({ ...m, charts: [...(m.charts || []), { judul: String(inp.judul || 'Grafik'), satuan: String(inp.satuan || ''), data: rows }] }));
          return 'ok, grafik sudah tampil di chat';
        },
      },
      {
        name: 'buka_menu',
        description: 'Membuka menu aplikasi untuk pengguna: beranda, terima, keluar, opname, po, stok, riwayat, atau master. Mengembalikan "ok".',
        inputSchema: { type: 'object', properties: { menu: { type: 'string', enum: Object.keys(ROUTES) } }, required: ['menu'] },
        execute(inp) {
          const r = ROUTES[String(inp.menu)];
          if (!r) throw new Error('menu tidak dikenal');
          router.push(r);
          return 'ok';
        },
      },
    ];
    try {
      const r = await sample(turns, { images: f || undefined, tools, signal: ctl.current.signal, onText: (t) => patch((m) => ({ ...m, content: t })) });
      patch((m) => ({ ...m, content: (r.text || m.content || (m.charts?.length ? '' : '(Tidak ada jawaban.)')) + (r.truncated ? '\n\n(Jawaban terpotong.)' : '') }));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : (e as Error)?.name === 'AbortError' ? 'cancelled' : '';
      const msg = code === 'cancelled' ? '(Dihentikan.)' : code === 'rate_limited' ? 'Gudi sedang sibuk. Coba lagi sebentar.' : code === 'image_rejected' ? 'Foto tidak bisa dibaca. Coba foto lain (JPG/PNG).' : 'Maaf, Gudi gagal menjawab. Coba lagi.' + (e instanceof Error && e.message ? ` (Detail: ${e.message})` : '');
      patch((m) => ({ ...m, content: (m.content ? m.content + '\n\n' : '') + msg }));
    }
    setBusy(false);
    ctl.current = null;
  }

  return (
    <>
      {!open && (
        <button
          ref={fabRef}
          onClick={() => setOpen(true)}
          aria-label="Buka Gudi, asisten AI gudang"
          className="no-print fixed right-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 grid size-15.5 place-items-center rounded-full border-[3px] border-accent bg-[#15212B] shadow-lg lg:right-6 lg:bottom-6"
        >
          <Mascot className="size-11" />
        </button>
      )}
      {open && (
        <section
          aria-label="Gudi, asisten AI gudang"
          className="no-print fixed inset-x-0 bottom-0 z-50 flex h-[calc(100%-40px)] flex-col overflow-hidden rounded-t-2xl border border-line bg-panel pb-[env(safe-area-inset-bottom)] shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:h-[min(640px,calc(100vh-40px))] sm:w-100 sm:rounded-2xl"
        >
          <div className="flex items-center gap-2.5 bg-[#15212B] py-2.5 pr-2.5 pl-3.5 text-[#E6ECF0]">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-accent"><Mascot className="size-8" /></div>
            <div className="flex-1">
              <b className="block font-display text-xl leading-none">Gudi</b>
              <span className="text-[13px] opacity-75">Asisten AI gudang Anda</span>
            </div>
            <button className="min-h-10 rounded-md px-2.5 text-sm font-semibold hover:bg-white/10" onClick={() => { ctl.current?.abort(); setChat([]); setFile(null); }}>Baru</button>
            <button className="grid min-h-10 place-items-center rounded-md px-2 hover:bg-white/10" onClick={() => { setOpen(false); setTimeout(() => fabRef.current?.focus(), 0); }} aria-label="Tutup Gudi"><X className="size-5" /></button>
          </div>
          <div className="hazard h-1.5" aria-hidden />
          <div ref={bodyRef} className="flex-1 overflow-y-auto p-3.5" aria-live="polite">
            {!chat.length ? (
              <div className="text-center">
                <Mascot className="mx-auto size-28" />
                <h3 className="mt-1 text-2xl font-semibold">Halo, {me.name.split(' ')[0]}! Gudi siap bantu</h3>
                <p className="mb-3 text-sm text-muted">Tanya soal PO, stok, atau penerimaan barang, minta grafik, atau kirim foto lalu tanyakan maksudnya.</p>
                {SUGG.map((s) => (
                  <button key={s} onClick={() => send(s)} className="mb-2 block min-h-11 w-full rounded-lg border border-line bg-soft px-3 text-left font-medium hover:border-muted">{s}</button>
                ))}
              </div>
            ) : (
              chat.map((m, i) => (
                <div key={i} className={cn('mb-3 max-w-[88%] rounded-xl px-3 py-2.5 text-[15px] [overflow-wrap:anywhere]', m.role === 'user' ? 'ml-auto rounded-br-sm bg-accent text-accent-ink' : 'rounded-bl-sm border border-line bg-soft')}>
                  {m.role === 'user' ? (
                    <>
                      <span className="whitespace-pre-wrap">{m.content}</span>
                      {m.img && <span className="mt-1 block text-[13px] opacity-80">Foto: {m.img}</span>}
                    </>
                  ) : (
                    <>
                      {m.content ? <Markdown text={m.content} /> : <span className="text-muted">Gudi sedang berpikir…</span>}
                      {m.charts?.map((c, j) => <Chart key={j} c={c} />)}
                    </>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="border-t border-line p-2.5">
            <div className="rounded-xl border border-line bg-soft p-1.5 focus-within:outline-3 focus-within:outline-accent">
              <textarea
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(q); } }}
                rows={1}
                placeholder="Tanya Gudi apa saja…"
                aria-label="Pesan untuk Gudi"
                className="max-h-30 min-h-11 w-full resize-none bg-transparent px-2 py-1.5 outline-none"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  {file && (
                    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-panel px-2.5 py-0.5 text-[13px] font-semibold text-muted">
                      <span className="truncate">{file.name}</span>
                      <button onClick={() => setFile(null)} aria-label="Hapus foto"><X className="size-3.5" /></button>
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 gap-1.5">
                  {!busy && (
                    <label className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-sm font-semibold">
                      <ImagePlus className="size-4" /> Foto
                      <input
                        type="file"
                        accept={IMAGE_TYPES.join(',')}
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (!f) return;
                          if (f.size > MAX_IMAGE_BYTES) { toast('Foto terlalu besar'); return; }
                          setFile(f);
                          inputRef.current?.focus();
                        }}
                      />
                    </label>
                  )}
                  {busy ? (
                    <button onClick={() => ctl.current?.abort()} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-sm font-semibold"><Square className="size-4" /> Stop</button>
                  ) : (
                    <button onClick={() => send(q)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-semibold text-accent-ink"><Send className="size-4" /> Kirim</button>
                  )}
                </span>
              </div>
            </div>
            <p className="mt-1.5 text-center text-xs text-muted">Gudi bisa keliru. Cek ulang angka penting sebelum mengambil keputusan.</p>
          </div>
        </section>
      )}
    </>
  );
}
