# Gudang tanpa kertas

Aplikasi penerimaan barang berbasis AI: pencocokan PO, surat jalan, dan barang fisik, inspeksi foto, tanda tangan digital, stok real-time, dan asisten AI **Gudi**.

## Struktur

```
public/index.html       Aplikasi (frontend)
public/claude-shim.js   Penghubung frontend ke backend sendiri
api/ai.js               Proxy ke Anthropic API (kunci API aman di server)
api/data.js             Simpan/baca data di Upstash Redis
lib/common.js           Cek kata sandi + klien Redis
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
   - `ANTHROPIC_API_KEY`: dari console.anthropic.com
   - `APP_PASSWORD`: kata sandi untuk masuk ke aplikasi
   - Opsional: `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), `SEED_DEMO=false` untuk mulai tanpa data contoh
5. **Redeploy** (Deployments → ⋯ → Redeploy) agar variabel terbaca.

Buka URL `*.vercel.app`, masukkan kata sandi, dan aplikasi siap dipakai.

## Catatan keamanan

- Jangan pernah commit `ANTHROPIC_API_KEY` ke repo. Simpan hanya di Vercel.
- Semua pengguna memakai satu kata sandi bersama. Untuk produksi, ganti dengan login per pengguna (misalnya Vercel Auth, Clerk, atau Supabase Auth) agar tercatat siapa petugas yang menerima barang.
- Setiap pertanyaan ke Gudi dan pembacaan foto memakai kredit Anthropic Anda.
