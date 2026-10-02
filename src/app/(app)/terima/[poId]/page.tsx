'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, FileText, ScanBarcode, X } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { SignaturePad } from '@/components/signature-pad';
import { SupplierRisk } from '@/components/supplier-risk';
import { Button, buttonClass, Card, Chip, cn, Input, Label, Note, Stamp, STATUS_CHIP, Textarea } from '@/components/ui';
import { aiErrorMessage, IMAGE_TYPES, sampleJSON } from '@/lib/ai';
import { errMsg } from '@/lib/client';
import { evaluate, fmt, isOpenPO, normalizePO } from '@/lib/evaluate';
import { ROLE_LABEL, type Inspection } from '@/lib/types';

interface AiSJ {
  nomor_surat_jalan: string | null;
  baris: { teks_asli: string; sku: string | null; qty: number | null; yakin: string; alasan: string }[];
  catatan: string;
}

export default function TerimaPO() {
  const { poId: raw } = useParams<{ poId: string }>();
  const poId = decodeURIComponent(raw);
  const router = useRouter();
  const { data, tol, can, me, receive, toast, setScreen } = useApp();
  const po = data?.pos[poId];

  const [sj, setSj] = useState<Record<string, number | ''>>({});
  const [fisik, setFisik] = useState<Record<string, number>>({});
  const [rusak, setRusak] = useState<Record<string, number>>({});
  const [unknown, setUnknown] = useState<string[]>([]);
  const [sjNo, setSjNo] = useState('');
  const [pengirim, setPengirim] = useState('');
  const [catatan, setCatatan] = useState('');
  const [sign, setSign] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [inspeksi, setInspeksi] = useState<Inspection[]>([]);
  const [aiSJ, setAiSJ] = useState<AiSJ | null>(null);
  const [busy, setBusy] = useState<'sj' | 'foto' | 'save' | null>(null);
  const [showText, setShowText] = useState(false);
  const [sjText, setSjText] = useState('');
  const [mult, setMult] = useState(1);
  const [last, setLast] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const ev = useMemo(() => (po ? evaluate(po, { sj, fisik, rusak, unknown }, tol) : null), [po, sj, fisik, rusak, unknown, tol]);

  // Informasi layar untuk Gudi, supaya bisa menjawab soal penerimaan yang sedang berjalan.
  useEffect(() => {
    if (!po || !ev) return;
    setScreen({ penerimaan_berjalan: { po: po.no, hasil_sementara: ev.hasil, kode_di_luar_po: unknown, baris: ev.rows.map((r) => ({ barang: r.nama, po: r.po, surat_jalan: r.sj, fisik: r.fisik, rusak: r.rusak, status: r.status })) } });
    return () => setScreen({});
  }, [po, ev, unknown, setScreen]);
  useEffect(() => { scanRef.current?.focus(); }, [po?.no]);

  if (!data) return <p className="text-muted">Memuat data gudang…</p>;
  if (!po || !ev) return <Card><p className="m-0">PO tidak ditemukan. <Link href="/terima" className="underline">Kembali ke daftar PO</Link></p></Card>;
  if (!isOpenPO(po) && busy !== 'save') {
    const st = normalizePO(po).status;
    return (
      <Card>
        <h2 className="mb-1 text-2xl font-semibold">{po.no} {st === 'Diterima' ? 'sudah diterima lengkap' : st === 'Ditutup' ? 'sudah ditutup' : 'dibatalkan'}</h2>
        <p className="mb-3 text-muted">PO ini tidak bisa menerima kiriman lagi.</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/po/${encodeURIComponent(poId)}`} className={buttonClass('primary')}>Lihat PO</Link>
          <Link href="/terima" className={buttonClass()}>Daftar PO</Link>
        </div>
      </Card>
    );
  }
  if (!can('petugas')) return <Card><p className="m-0 text-muted">Akun Viewer hanya bisa melihat data.</p></Card>;

  function scan(code: string) {
    const c = code.trim();
    if (!c || !po) return;
    const it = po.items.find((i) => String(i.barcode) === c || i.sku.toLowerCase() === c.toLowerCase());
    if (it) {
      setFisik((f) => ({ ...f, [it.sku]: (Number(f[it.sku]) || 0) + mult }));
      setLast(it.sku);
      toast(`+${mult} ${it.nama}`);
    } else {
      setUnknown((u) => [...u, c]);
      toast(`Kode ${c} tidak ada di PO ini`);
    }
  }

  async function readSJ(files: FileList | null, text: string | null) {
    if (!po) return;
    setBusy('sj');
    const prompt = `Kamu membantu petugas gudang memverifikasi barang masuk.
Daftar barang di Purchase Order ${po.no} dari ${po.supplier} (JSON): ${JSON.stringify(po.items.map((i) => ({ sku: i.sku, nama: i.nama, satuan: i.satuan, qty_po: i.qty })))}
${files ? 'Gambar terlampir adalah foto surat jalan (delivery note) dari supplier.' : 'Teks surat jalan dari supplier:\n"""\n' + text + '\n"""'}
Baca setiap baris barang di surat jalan. Cocokkan tiap baris ke SKU di PO walaupun namanya ditulis berbeda (singkatan, merek, ukuran). Konversikan jumlah ke satuan PO hanya jika isi per kemasan tertulis jelas.
Balas HANYA dengan JSON berbentuk:
{"nomor_surat_jalan": string atau null, "baris":[{"teks_asli": string, "sku": string atau null, "qty": number atau null, "yakin": "tinggi"|"sedang"|"rendah", "alasan": string}], "catatan": string}
Isi sku dengan null jika baris tidak cocok dengan barang mana pun di PO. Tulis alasan dan catatan dalam bahasa Indonesia, singkat.`;
    try {
      const res = await sampleJSON<AiSJ>(prompt, files ? { images: files } : {});
      setAiSJ(res);
      const next: Record<string, number> = {};
      (res.baris || []).forEach((b) => { if (b.sku && po.items.some((i) => i.sku === b.sku) && typeof b.qty === 'number') next[b.sku] = b.qty; });
      setSj((s) => ({ ...s, ...next }));
      if (res.nomor_surat_jalan) setSjNo((n) => n || res.nomor_surat_jalan || '');
      setShowText(false);
      toast('Jumlah surat jalan terisi dari hasil baca AI');
    } catch (e) {
      toast(aiErrorMessage(e, 'AI gagal membaca dokumen. Isi jumlah secara manual.'));
    }
    setBusy(null);
  }

  async function inspect(files: FileList) {
    if (!po) return;
    setBusy('foto');
    const prompt = `Foto terlampir adalah barang yang baru diterima di gudang untuk PO ${po.no} (barang: ${po.items.map((i) => i.nama).join(', ')}).
Periksa kondisi kemasan: penyok, sobek, basah atau bocor, segel rusak, label tidak terbaca, tanda kedaluwarsa jika terlihat.
Balas HANYA dengan JSON: {"kondisi":"baik"|"rusak"|"ragu","temuan":[string],"saran":string}. Bahasa Indonesia, singkat.`;
    try {
      const res = await sampleJSON<Partial<Inspection>>(prompt, { images: files });
      setInspeksi((x) => [...x, { kondisi: res.kondisi || 'ragu', temuan: res.temuan || [], saran: res.saran || '' }]);
    } catch (e) {
      toast(aiErrorMessage(e, 'AI gagal memeriksa foto. Coba foto yang lebih jelas.'));
    }
    setBusy(null);
  }

  async function save() {
    if (!ev || !po) return;
    if (ev.rows.every((r) => r.fisik === 0)) return toast('Scan barang dulu sebelum menyimpan');
    if (!sign) return toast('Minta tanda tangan pengirim dulu');
    setBusy('save');
    try {
      const g = await receive({ poId, sj, fisik, rusak, unknown, sjNo, pengirim, catatan, inspeksi, ttd: sign, approved });
      toast(g.keputusan !== 'Ditahan' ? 'Diterima. Stok sudah bertambah.' : 'Disimpan sebagai ditahan. Stok belum bertambah.');
      router.replace(`/riwayat/${encodeURIComponent(g.no)}`);
    } catch (e) {
      toast(errMsg(e, 'Gagal menyimpan'));
      setBusy(null);
    }
  }

  const tone = ev.hasil === 'Diterima' ? 'ok' : ev.hasil === 'Ditahan' ? 'bad' : 'warn';
  const stampSub =
    (ev.hasil === 'Diterima' ? 'Barang cocok dengan surat jalan dan sisa PO.'
    : ev.hasil === 'Ditahan' ? `Ada selisih di atas toleransi ${tol}%, barang rusak, kelebihan dari sisa PO, kode di luar PO, atau barang di surat jalan belum discan. Perlu persetujuan supervisor.`
    : `Ada selisih kecil dalam toleransi ${tol}%. Barang bisa diterima dengan catatan.`) +
    (ev.lengkap ? ' PO akan selesai setelah kiriman ini.' : ' Kiriman ini sebagian; PO tetap terbuka untuk sisanya.');
  const numField = (v: number | '' | undefined, set: (n: number | '') => void, label: string, allowEmpty = false) => (
    <Input
      type="number"
      min={0}
      inputMode="numeric"
      aria-label={label}
      value={v ?? ''}
      onChange={(e) => set(e.target.value === '' ? (allowEmpty ? '' : 0) : Math.max(0, Number(e.target.value) || 0))}
      className="h-10 min-h-0! w-20! px-2 font-display text-lg"
    />
  );

  return (
    <>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{po.no}</h2>
          <div className="text-sm text-muted">{po.supplier}</div>
          <div className="mt-2"><SupplierRisk supplier={po.supplier} grn={data.grn} /></div>
        </div>
        <Link href="/terima" className={buttonClass('ghost')}>Batal</Link>
      </div>

      <div className="space-y-4">
        <Card>
          <h3 className="mb-1 text-xl font-semibold">1. Dokumen dari supplier</h3>
          <p className="mb-3 text-sm text-muted">AI membaca surat jalan dan mencocokkan tiap baris ke barang di PO, walau namanya ditulis berbeda.</p>
          <div className="flex flex-wrap gap-2">
            <label className={buttonClass()}>
              <Camera className="size-4" /> Foto surat jalan
              <input type="file" accept={IMAGE_TYPES.join(',')} capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files; if (f?.length) readSJ(f, null); e.target.value = ''; }} />
            </label>
            <Button onClick={() => setShowText((s) => !s)}><FileText className="size-4" /> Tempel teks surat jalan</Button>
          </div>
          {showText && (
            <div className="mt-3">
              <Label htmlFor="sjtext">Teks surat jalan atau email dari supplier</Label>
              <Textarea id="sjtext" value={sjText} onChange={(e) => setSjText(e.target.value)} placeholder="Contoh: Beras Pandan Wangi 5kg - 40 sak" />
              <Button variant="primary" className="mt-2" disabled={busy === 'sj'} onClick={() => (sjText.trim() ? readSJ(null, sjText.trim()) : toast('Tempel teks surat jalan dulu'))}>Baca dengan AI</Button>
            </div>
          )}
          {busy === 'sj' && <div className="mt-3 border-l-4 border-accent bg-soft px-3 py-2.5 text-[15px]">AI sedang membaca surat jalan…</div>}
          {aiSJ && (
            <div className="mt-3 border-l-4 border-accent bg-soft px-3 py-2.5 text-[15px]">
              <b>Hasil baca AI{aiSJ.nomor_surat_jalan ? ' untuk surat jalan ' + aiSJ.nomor_surat_jalan : ''}</b>
              <ul className="mt-1.5 list-disc pl-5">
                {(aiSJ.baris || []).map((b, i) => (
                  <li key={i}>
                    {b.teks_asli} → {b.sku ? `${po.items.find((x) => x.sku === b.sku)?.nama || b.sku}, ${fmt(b.qty)}` : <b>tidak ada di PO</b>}{' '}
                    <span className="text-muted">({b.yakin}: {b.alasan})</span>
                  </li>
                ))}
              </ul>
              {aiSJ.catatan && <p className="mt-1.5 text-sm">{aiSJ.catatan}</p>}
            </div>
          )}
          <div className="mt-3">
            <Label htmlFor="sjno">Nomor surat jalan</Label>
            <Input id="sjno" value={sjNo} onChange={(e) => setSjNo(e.target.value)} />
          </div>
        </Card>

        <Card>
          <h3 className="mb-1 text-xl font-semibold">2. Scan barang fisik</h3>
          <p className="mb-3 text-sm text-muted">Arahkan scanner barcode ke kolom ini, atau ketik kode barcode/SKU lalu tekan Enter. Isi kolom kanan untuk scan per karton.</p>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <ScanBarcode className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
              <Input
                ref={scanRef}
                id="scan"
                autoComplete="off"
                enterKeyHint="done"
                placeholder="Scan barcode atau SKU"
                aria-label="Kode barcode atau SKU"
                className="pl-10 font-display text-xl tracking-wide"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  scan(e.currentTarget.value);
                  e.currentTarget.value = '';
                }}
              />
            </div>
            <Input id="mult" type="number" min={1} value={mult} onChange={(e) => setMult(Math.max(1, parseInt(e.target.value, 10) || 1))} aria-label="Jumlah per scan" className="w-20! shrink-0 text-center" />
          </div>
          {unknown.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-l-4 border-accent bg-soft px-3 py-2.5 text-[15px]">
              <b>Kode di luar PO:</b> {unknown.join(', ')}
              <Button variant="ghost" size="sm" onClick={() => setUnknown([])}><X className="size-4" /> Hapus</Button>
            </div>
          )}
          <label className={buttonClass('secondary', 'md', 'mt-3')}>
            <Camera className="size-4" /> Cek kondisi dengan foto
            <input type="file" accept={IMAGE_TYPES.join(',')} capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files; if (f?.length) inspect(f); e.target.value = ''; }} />
          </label>
          {busy === 'foto' && <div className="mt-3 border-l-4 border-accent bg-soft px-3 py-2.5 text-[15px]">AI sedang memeriksa foto barang…</div>}
          {inspeksi.map((x, i) => (
            <div key={i} className="mt-3 border-l-4 border-accent bg-soft px-3 py-2.5 text-[15px]">
              <Chip tone={x.kondisi === 'baik' ? 'ok' : x.kondisi === 'rusak' ? 'bad' : 'warn'}>Kondisi {x.kondisi}</Chip>
              {x.temuan.length > 0 && <ul className="mt-1.5 list-disc pl-5">{x.temuan.map((t, j) => <li key={j}>{t}</li>)}</ul>}
              {x.saran && <p className="mt-1.5 text-sm">{x.saran}</p>}
            </div>
          ))}
        </Card>

        <Card>
          <h3 className="mb-3 text-xl font-semibold">3. Pencocokan otomatis</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-130 border-collapse">
              <thead>
                <tr className="border-b border-line text-left text-[13px] text-muted">
                  <th className="px-1.5 py-1.5 font-medium">Barang</th>
                  <th className="px-1.5 py-1.5 font-medium">Sisa PO</th>
                  <th className="px-1.5 py-1.5 font-medium">Surat jalan</th>
                  <th className="px-1.5 py-1.5 font-medium">Fisik</th>
                  <th className="px-1.5 py-1.5 font-medium">Rusak</th>
                  <th className="px-1.5 py-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {ev.rows.map((r) => (
                  <tr key={r.sku} className={cn('border-b border-line align-top', last === r.sku && 'bg-warn-bg')}>
                    <td className="px-1.5 py-2">
                      <b>{r.nama}</b>
                      <div className="text-sm text-muted">{r.sku}, {r.satuan}</div>
                      {r.notes.length > 0 && <div className="text-sm">{r.notes.join('. ')}</div>}
                    </td>
                    <td className="px-1.5 py-2">
                      <div className="font-display text-2xl font-semibold tabular-nums">{fmt(r.sisa ?? r.po)}</div>
                      {r.sisa !== r.po && <div className="text-xs text-muted">dari {fmt(r.po)}</div>}
                    </td>
                    <td className="px-1.5 py-2">{numField(sj[r.sku], (n) => { setSj((s) => ({ ...s, [r.sku]: n })); setLast(null); }, `Jumlah surat jalan ${r.nama}`, true)}</td>
                    <td className="px-1.5 py-2">{numField(fisik[r.sku] ?? 0, (n) => { setFisik((s) => ({ ...s, [r.sku]: Number(n) })); setLast(null); }, `Jumlah fisik ${r.nama}`)}</td>
                    <td className="px-1.5 py-2">{numField(rusak[r.sku] ?? 0, (n) => { setRusak((s) => ({ ...s, [r.sku]: Number(n) })); setLast(null); }, `Jumlah rusak ${r.nama}`)}</td>
                    <td className="px-1.5 py-2">{STATUS_CHIP[r.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4"><Stamp tone={tone} title={ev.hasil} sub={stampSub} /></div>
          {ev.hasil === 'Ditahan' &&
            (can('supervisor') ? (
              <label className="mt-3 flex items-center gap-2">
                <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} className="size-5.5 accent-[#F2B705]" />
                Saya setujui sebagai {ROLE_LABEL[me.role]}, barang tetap diterima
              </label>
            ) : (
              <Note className="mt-3">Penerimaan ini akan disimpan sebagai <b>Ditahan</b> dan stok belum bertambah. Supervisor bisa menyetujuinya nanti dari menu Riwayat.</Note>
            ))}
        </Card>

        <Card>
          <h3 className="mb-3 text-xl font-semibold">4. Tanda tangan digital</h3>
          <Label htmlFor="pengirim">Nama pengirim / sopir</Label>
          <Input id="pengirim" value={pengirim} onChange={(e) => setPengirim(e.target.value)} />
          <p className="mt-3 mb-1.5 text-sm text-muted">Minta pengirim tanda tangan di kotak ini.</p>
          <SignaturePad value={sign} onChange={setSign} />
          <Button variant="ghost" size="sm" className="mt-1.5" onClick={() => setSign(null)}>Hapus tanda tangan</Button>
          <div className="mt-3">
            <Label htmlFor="catatan">Catatan</Label>
            <Textarea id="catatan" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          </div>
        </Card>

        <Button variant="primary" size="lg" className="w-full" disabled={busy === 'save'} onClick={save}>
          {busy === 'save' ? 'Menyimpan…' : 'Simpan penerimaan'}
        </Button>
      </div>
    </>
  );
}
