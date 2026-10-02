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
  page.tsx                Beranda: ringkasan dan KPI
  terima/                 Daftar PO dan alur penerimaan per PO
  po/  stok/  riwayat/    Purchase order, stok, riwayat & detail GRN
  akun/  admin/           Ganti kata sandi; kelola pengguna & log audit
src/app/api/              auth, data, admin, ai (Route Handlers)
src/components/           Shell (sidebar, header, menu), Gudi, UI dasar
src/lib/                  Tipe data, aturan pencocokan (dipakai klien & server), klien API & AI
src/server/core.ts        Redis, sesi, peran, log audit
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
| Viewer | Melihat PO, stok, riwayat; bertanya ke Gudi |
| Petugas | + Menerima barang. Penerimaan dengan selisih besar tersimpan sebagai **Ditahan** |
| Supervisor | + Membuat PO, mengubah toleransi, menyetujui penerimaan yang ditahan |
| Admin | + Menyetujui akun baru, mengubah peran, menonaktifkan akun, melihat log audit |

Akun yang mendaftar sendiri berstatus **menunggu** sampai disetujui admin. Semua aturan peran dicek di server.

## Integritas data

- Penerimaan dan persetujuan diproses di server dalam satu langkah; hasil pencocokan dihitung ulang di server dengan aturan yang sama dengan tampilan (`src/lib/evaluate.ts`).
- Setiap PO hanya bisa diterima sekali (terkunci walau dua petugas menyimpan bersamaan); persetujuan penerimaan yang ditahan juga hanya berlaku sekali.
- Stok ditambah secara atomik di Redis (`HINCRBYFLOAT`), sehingga tidak ada penambahan yang hilang.
- GRN tidak bisa diubah setelah disimpan, kecuali persetujuan supervisor. Setiap perubahan tercatat di log audit (5.000 entri terakhir).
- Aplikasi hanya mengunduh ulang data bila ada perubahan (nomor versi); tanda tangan disimpan terpisah dan dimuat saat detail GRN dibuka.

## Catatan keamanan

- Jangan pernah commit `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, atau token Redis ke repo. Simpan hanya di Vercel atau `.env.local`.
- Kata sandi di-hash dengan scrypt; sesi berlaku 30 hari; percobaan masuk dibatasi 10 kali per 15 menit per email.
- Paket gratis Gemini dibatasi jumlah permintaan per menit/hari, dan Google dapat memakai data paket gratis untuk meningkatkan produknya.
