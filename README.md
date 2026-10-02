# Gudang tanpa kertas

Aplikasi penerimaan barang berbasis AI: pencocokan PO, surat jalan, dan barang fisik, inspeksi foto, tanda tangan digital, stok real-time, dan asisten AI **Gudi**.

## Struktur

```
public/index.html       Aplikasi (frontend)
public/login.html       Halaman masuk dan daftar akun
public/claude-shim.js   Penghubung frontend ke backend sendiri
api/ai.js               Proxy ke Gemini atau Anthropic API (kunci API aman di server)
api/auth.js             Masuk, daftar, keluar (akun & sesi disimpan di Redis)
api/data.js             Simpan/baca data di Upstash Redis
lib/common.js           Cek sesi login + klien Redis
```

## Deploy ke Vercel

1. **Push ke GitHub**: buat repo baru (misalnya `gudang-ai`), lalu unggah semua file ini.
   ```bash
   git init && git add . && git commit -m "Gudang tanpa kertas"
   git branch -M main
   git remote add origin https://github.com/USERNAME/gudang-ai.git
   git push -u origin main
   ```
2. **Import di Vercel**: vercel.com → Add New → Project → pilih repo `gudang-ai`. Framework Preset: **Other**. Biarkan Build Command kosong.
3. **Hubungkan database**: di project Vercel → Storage → Marketplace → **Upstash Redis** → Connect. Variabel `KV_REST_API_URL` dan `KV_REST_API_TOKEN` akan terisi otomatis.
4. **Isi Environment Variables** (Settings → Environment Variables):
   - `GEMINI_API_KEY`: dari aistudio.google.com → Get API key (ada paket gratis), **atau** `ANTHROPIC_API_KEY` dari console.anthropic.com (berbayar). Jika keduanya diisi, Gemini yang dipakai.
   - Opsional: `GEMINI_MODEL` (default `gemini-flash-latest`), `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), `SEED_DEMO=false` untuk mulai tanpa data contoh
5. **Redeploy** (Deployments → ⋯ → Redeploy) agar variabel terbaca.

Buka URL `*.vercel.app`, lalu masuk atau daftar akun. Akun admin bawaan `admin@admin.com` dibuat otomatis di database saat pertama kali masuk.

## Catatan keamanan

- Jangan pernah commit `GEMINI_API_KEY` atau `ANTHROPIC_API_KEY` ke repo. Simpan hanya di Vercel.
- Setiap pengguna punya akun sendiri (kata sandi di-hash dengan scrypt, sesi berlaku 30 hari), sehingga tercatat siapa petugas yang menerima barang.
- Siapa pun yang tahu alamat aplikasi bisa mendaftar dan memakai kuota AI. Jika perlu, batasi pendaftaran (misalnya persetujuan admin).
- Dengan Anthropic, setiap pertanyaan ke Gudi dan pembacaan foto memakai kredit Anda. Paket gratis Gemini dibatasi jumlah permintaan per menit/hari, dan Google dapat memakai data paket gratis untuk meningkatkan produknya.
