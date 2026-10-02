import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { audit, bearer, body, fail, handle, json, publicUser, redis, requireUser, SESSION_KEY, USERS_KEY, type StoredUser } from '@/server/core';

const scryptAsync = promisify(scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 hari
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

// Akun admin bawaan. Dibuat otomatis di database saat pertama kali dipakai masuk.
// Hanya hash kata sandinya yang disimpan di sini.
const SEED_ADMIN: StoredUser = {
  email: 'admin@admin.com',
  name: 'Admin',
  role: 'admin',
  status: 'active',
  salt: '1216364d714c18482edd052a50dc45aa',
  hash: 'fdcfb1adb0eb9c77e70631627b83dd85967d3658600587ad1e7ab2fc3b157411ab46aeac50b77396147344843a4b7996a9ced1c7a57a1ce3d1524e2e94d98ff5',
};

const hashPassword = async (pw: string, salt: string) => (await scryptAsync(pw, salt, 64)).toString('hex');

async function matches(pw: string, u: Partial<StoredUser>) {
  if (!u.salt || !u.hash) return false;
  const a = Buffer.from(await hashPassword(pw, u.salt), 'hex');
  const b = Buffer.from(u.hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

async function getUser(email: string): Promise<StoredUser | null> {
  const raw = await redis<string | null>('HGET', USERS_KEY, email);
  if (raw) return JSON.parse(raw);
  if (email === SEED_ADMIN.email) {
    const u = { ...SEED_ADMIN, created: new Date().toISOString() };
    await redis('HSETNX', USERS_KEY, u.email, JSON.stringify(u));
    return u;
  }
  return null;
}

async function startSession(u: StoredUser) {
  const token = randomBytes(32).toString('base64url');
  await redis('SET', SESSION_KEY(token), u.email, 'EX', SESSION_TTL);
  return json({ token, user: publicUser(u) });
}

// Batasi percobaan masuk/daftar: 10 kali per 15 menit per email.
async function tooManyAttempts(email: string) {
  const k = `gudang:attempts:${email}`;
  const n = await redis<number>('INCR', k);
  if (n === 1) await redis('EXPIRE', k, 900);
  return n > 10;
}

const validPassword = (p: string) => p.length >= 8 && p.length <= 200;

export const POST = handle(async (req) => {
  const b = await body<Record<string, unknown>>(req);
  const action = b.action;

  if (action === 'login' || action === 'register') {
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '').trim();
    if (!EMAIL_RE.test(email)) return fail(400, 'Format email tidak valid');
    if (!validPassword(password)) return fail(400, 'Kata sandi minimal 8 karakter');
    if (await tooManyAttempts(email)) return fail(429, 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.');

    if (action === 'login') {
      let u = await getUser(email);
      let ok = !!u && (await matches(password, u));
      // Admin bawaan yang belum pernah ganti kata sandi: jika data di database rusak
      // tetapi kata sandi bawaan cocok, perbaiki datanya.
      if (!ok && email === SEED_ADMIN.email && !u?.passwordChanged && (await matches(password, SEED_ADMIN))) {
        u = { ...(u || {}), ...SEED_ADMIN, created: u?.created || new Date().toISOString() };
        await redis('HSET', USERS_KEY, email, JSON.stringify(u));
        console.log(`[auth] login ${email}: data admin di database diperbaiki`);
        ok = true;
      }
      if (!ok || !u) {
        // Hanya alasan dan panjang kata sandi yang dicatat, bukan kata sandinya.
        console.log(`[auth] login gagal ${email}: ${u ? 'kata sandi tidak cocok' : 'email tidak terdaftar'} (panjang kata sandi ${password.length})`);
        return fail(401, 'Email atau kata sandi salah');
      }
      const status = u.status || 'active';
      if (status === 'pending') return fail(403, 'Akun Anda menunggu persetujuan admin. Hubungi admin gudang.');
      if (status === 'disabled') return fail(403, 'Akun Anda dinonaktifkan. Hubungi admin gudang.');
      await redis('DEL', `gudang:attempts:${email}`);
      console.log(`[auth] login berhasil ${email}`);
      return startSession(u);
    }

    const name = String(b.name || '').trim().slice(0, 80);
    if (!name) return fail(400, 'Nama wajib diisi');
    if (email === SEED_ADMIN.email || (await redis<number>('HEXISTS', USERS_KEY, email))) return fail(409, 'Email sudah terdaftar. Silakan masuk.');
    const salt = randomBytes(16).toString('hex');
    const u: StoredUser = { email, name, role: 'petugas', status: 'pending', salt, hash: await hashPassword(password, salt), created: new Date().toISOString() };
    if (!(await redis<number>('HSETNX', USERS_KEY, email, JSON.stringify(u)))) return fail(409, 'Email sudah terdaftar. Silakan masuk.');
    await audit({ email, name }, 'daftar akun', `${email} mendaftar, menunggu persetujuan`);
    return json({ pending: true, message: 'Pendaftaran terkirim. Admin perlu menyetujui akun Anda sebelum bisa masuk.' }, 202);
  }

  if (action === 'logout') {
    const token = bearer(req);
    if (token) await redis('DEL', SESSION_KEY(token));
    return json({ ok: true });
  }

  const me = await requireUser(req);
  if (me instanceof Response) return me;
  if (action === 'me') return json({ user: me });

  if (action === 'password') {
    const oldPw = String(b.old || '').trim();
    const newPw = String(b.new || '').trim();
    if (!validPassword(newPw)) return fail(400, 'Kata sandi baru minimal 8 karakter');
    if (await tooManyAttempts(me.email)) return fail(429, 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.');
    const u = await getUser(me.email);
    if (!u || !(await matches(oldPw, u))) return fail(401, 'Kata sandi lama salah');
    u.salt = randomBytes(16).toString('hex');
    u.hash = await hashPassword(newPw, u.salt);
    u.passwordChanged = true;
    await redis('HSET', USERS_KEY, me.email, JSON.stringify(u));
    await redis('DEL', `gudang:attempts:${me.email}`);
    await audit(me, 'ganti kata sandi', me.email);
    return json({ ok: true });
  }

  if (action === 'profiles') {
    const ids = (Array.isArray(b.ids) ? b.ids : []).slice(0, 100).map(String);
    const out: Record<string, { name: string }> = {};
    if (ids.length) {
      const rows = await redis<(string | null)[]>('HMGET', USERS_KEY, ...ids);
      ids.forEach((id, i) => {
        try { if (rows[i]) out[id] = { name: JSON.parse(rows[i]!).name }; } catch { /* lewati */ }
      });
    }
    return json(out);
  }
  return fail(400, 'Aksi tidak dikenal');
});
