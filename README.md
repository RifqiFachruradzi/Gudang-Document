# Gudang tanpa kertas

Aplikasi penerimaan barang berbasis AI: pencocokan PO, surat jalan, dan barang fisik, inspeksi foto, tanda tangan digital, stok real-time, persetujuan supervisor, log audit, dan asisten AI **Gudi**.

## Teknologi

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS v4** untuk tampilan, ikon **lucide-react**, font Barlow via `next/font`
- **Route Handlers** Next.js sebagai API, data di **Upstash Redis** (REST)
- AI: **Google Gemini** (ada paket gratis) atau **Anthropic Claude**

## Struktur

```
src/app/login/            Halaman masuk dan daftar akun
src/app/(app)/            Halaman aplikasi (wajib login)
  page.tsx                Beranda: ringkasan, persetujuan, stok menipis
  terima/                 PO terbuka dan alur penerimaan (pengiriman bertahap)
  keluar/                 Barang keluar (surat jalan keluar)
  opname/                 Stok opname dan penyesuaian stok
  po/                     Purchase order: buat, ubah, batalkan, tutup sisa, hapus
  stok/                   Stok per rak dan kartu stok per barang
  riwayat/                Riwayat & detail GRN
  master/                 Master data barang dan supplier
  akun/  admin/           Ganti kata sandi; kelola pengguna & log audit
src/app/api/              auth, data, admin, ai (Route Handlers)
src/components/           Shell (sidebar, header, menu), Gudi, UI dasar
src/lib/                  Tipe data, aturan pencocokan (dipakai klien & server), klien API & AI
src/server/core.ts        Redis, sesi, peran, log audit
src/server/store.ts       Kunci proses, operasi stok atomik, nomor dokumen
src/server/receiving.ts   Penerimaan & persetujuan GRN
src/server/purchase.ts    Kelola PO, master barang & supplier
src/server/stock.ts       Barang keluar, stok opname
```

## Menjalankan di komputer

```bash
npm install
cp .env.example .env.local   # isi KV_REST_API_URL, KV_REST_API_TOKEN, GEMINI_API_KEY
npm run dev                  # http://localhost:3000
npm run build                # cek build produksi
```

## Deploy ke Vercel

`vercel.json` sudah menetapkan framework Next.js, jadi Vercel otomatis menjalankan `next build`.

1. Hubungkan repo ini ke project Vercel.
2. **Storage → Create Database → Upstash for Redis → Connect** ke project. `KV_REST_API_URL` dan `KV_REST_API_TOKEN` terisi otomatis.
3. **Settings → Environment Variables**:
   - `GEMINI_API_KEY` dari aistudio.google.com (paket gratis), **atau** `ANTHROPIC_API_KEY` dari console.anthropic.com. Jika keduanya diisi, Gemini yang dipakai.
   - Opsional: `GEMINI_MODEL` (default `gemini-flash-latest`), `ANTHROPIC_MODEL`, `SEED_DEMO=false` untuk mulai tanpa data contoh.
4. Redeploy. Masuk dengan akun admin bawaan `admin@admin.com` (dibuat otomatis saat pertama kali masuk), lalu segera ganti kata sandinya di menu **Akun saya**.

## Peran pengguna

| Peran | Bisa |
|---|---|
| Viewer | Melihat semua data; bertanya ke Gudi |
| Petugas | + Menerima barang, mencatat barang keluar, mengirim hitungan stok opname. Penerimaan dengan selisih besar tersimpan sebagai **Ditahan** |
| Supervisor | + Kelola PO dan master data, mengubah toleransi, menyetujui penerimaan yang ditahan dan penyesuaian stok |
| Admin | + Menyetujui akun baru, mengubah peran, menonaktifkan akun, melihat log audit |

Akun yang mendaftar sendiri berstatus **menunggu** sampai disetujui admin. Semua aturan peran dicek di server.

## Alur gudang

- **Penerimaan bertahap**: setiap PO mencatat jumlah yang sudah diterima per barang. Kiriman yang lebih sedikit dari sisa PO diterima normal; status PO *Terbuka → Diterima sebagian → Diterima*. Penerimaan ditahan bila selisih dengan surat jalan, kelebihan dari sisa PO, atau barang rusak melebihi toleransi, atau ada kode di luar PO.
- **Kelola PO** (Supervisor/Admin): ubah selama belum ada penerimaan; batalkan (belum ada barang diterima) atau tutup sisa (sudah sebagian) dengan alasan; hapus bila belum ada penerimaan.
- **Barang keluar**: dokumen GI mengurangi stok; tidak bisa melebihi stok yang ada. Bisa dicetak sebagai surat jalan.
- **Stok opname / penyesuaian**: hitung fisik atau catat barang rusak/hilang; selisih diterapkan ke stok setelah disetujui Supervisor/Admin.
- **Master data**: barang (SKU, barcode, satuan, rak, stok minimum) dan supplier. Barang/supplier baru dari PO otomatis masuk; database lama diisi otomatis dari PO dan stok yang ada.
- **Kartu stok**: riwayat masuk, keluar, dan penyesuaian per barang.

## Integritas data

- Penerimaan dan persetujuan diproses di server dalam satu langkah; hasil pencocokan dihitung ulang di server dengan aturan yang sama dengan tampilan (`src/lib/evaluate.ts`).
- Penerimaan untuk PO yang sama diproses satu per satu (kunci proses di Redis), sehingga sisa PO selalu benar walau dua petugas menyimpan bersamaan; persetujuan penerimaan atau penyesuaian hanya berlaku sekali.
- Barang keluar mengurangi stok secara atomik; bila salah satu barang tidak cukup, seluruh dokumen dibatalkan sehingga stok tidak pernah minus.
- Stok ditambah secara atomik di Redis (`HINCRBYFLOAT`), sehingga tidak ada penambahan yang hilang.
- GRN tidak bisa diubah setelah disimpan, kecuali persetujuan supervisor. Setiap perubahan tercatat di log audit (5.000 entri terakhir).
- Aplikasi hanya mengunduh ulang data bila ada perubahan (nomor versi); tanda tangan disimpan terpisah dan dimuat saat detail GRN dibuka.

## Catatan keamanan

- Jangan pernah commit `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, atau token Redis ke repo. Simpan hanya di Vercel atau `.env.local`.
- Kata sandi di-hash dengan scrypt; sesi berlaku 30 hari; percobaan masuk dibatasi 10 kali per 15 menit per email.
- Paket gratis Gemini dibatasi jumlah permintaan per menit/hari, dan Google dapat memakai data paket gratis untuk meningkatkan produknya.
