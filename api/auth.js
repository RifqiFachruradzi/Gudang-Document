import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { redis, requireUser, bearer, SESSION_KEY, USERS_KEY } from '../lib/common.js';

const scryptAsync = promisify(scrypt);
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 hari
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

// Akun admin bawaan. Dibuat otomatis di database saat pertama kali dipakai masuk.
// Hanya hash kata sandinya yang disimpan di sini.
const SEED_ADMIN = {
  email: 'admin@admin.com',
  name: 'Admin',
  role: 'admin',
  salt: '1216364d714c18482edd052a50dc45aa',
  hash: 'fdcfb1adb0eb9c77e70631627b83dd85967d3658600587ad1e7ab2fc3b157411ab46aeac50b77396147344843a4b7996a9ced1c7a57a1ce3d1524e2e94d98ff5',
};

async function hashPassword(password, salt) {
  return (await scryptAsync(password, salt, 64)).toString('hex');
}

async function matches(password, u) {
  if (!u.salt || !u.hash) return false;
  const a = Buffer.from(await hashPassword(password, u.salt), 'hex'), b = Buffer.from(u.hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

async function getUser(email) {
  const raw = await redis('HGET', USERS_KEY, email);
  if (raw) return JSON.parse(raw);
  if (email === SEED_ADMIN.email) {
    const u = { ...SEED_ADMIN, created: new Date().toISOString() };
    await redis('HSETNX', USERS_KEY, u.email, JSON.stringify(u));
    return u;
  }
  return null;
}

async function startSession(res, u) {
  const token = randomBytes(32).toString('base64url');
  await redis('SET', SESSION_KEY(token), u.email, 'EX', SESSION_TTL);
  return res.status(200).json({ token, user: { email: u.email, name: u.name } });
}

// Batasi percobaan masuk/daftar: 10 kali per 15 menit per email.
async function tooManyAttempts(email) {
  const k = `gudang:attempts:${email}`;
  const n = await redis('INCR', k);
  if (n === 1) await redis('EXPIRE', k, 900);
  return n > 10;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak didukung' });
  const body = req.body || {};
  const action = body.action;
  try {
    if (action === 'login' || action === 'register') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '').trim();
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Format email tidak valid' });
      if (password.length < 8 || password.length > 200) return res.status(400).json({ error: 'Kata sandi minimal 8 karakter' });
      if (await tooManyAttempts(email)) return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.' });

      if (action === 'login') {
        const u = await getUser(email);
        let ok = !!u && (await matches(password, u));
        // Akun admin bawaan: jika data di database berbeda tetapi kata sandi bawaan cocok, perbaiki datanya.
        if (!ok && email === SEED_ADMIN.email && (await matches(password, SEED_ADMIN))) {
          const fixed = { ...(u || {}), ...SEED_ADMIN, created: u?.created || new Date().toISOString() };
          await redis('HSET', USERS_KEY, email, JSON.stringify(fixed));
          console.log(`[auth] login ${email}: data admin di database diperbaiki`);
          return startSession(res, fixed);
        }
        if (!ok) {
          // Hanya alasan dan panjang kata sandi yang dicatat, bukan kata sandinya.
          console.log(`[auth] login gagal ${email}: ${u ? 'kata sandi tidak cocok' : 'email tidak terdaftar'} (panjang kata sandi ${password.length})`);
          return res.status(401).json({ error: 'Email atau kata sandi salah' });
        }
        console.log(`[auth] login berhasil ${email}`);
        await redis('DEL', `gudang:attempts:${email}`);
        return startSession(res, u);
      }

      const name = String(body.name || '').trim().slice(0, 80);
      if (!name) return res.status(400).json({ error: 'Nama wajib diisi' });
      if (email === SEED_ADMIN.email || (await redis('HEXISTS', USERS_KEY, email)))
        return res.status(409).json({ error: 'Email sudah terdaftar. Silakan masuk.' });
      const salt = randomBytes(16).toString('hex');
      const u = { email, name, role: 'petugas', salt, hash: await hashPassword(password, salt), created: new Date().toISOString() };
      if (!(await redis('HSETNX', USERS_KEY, email, JSON.stringify(u))))
        return res.status(409).json({ error: 'Email sudah terdaftar. Silakan masuk.' });
      return startSession(res, u);
    }

    if (action === 'logout') {
      const token = bearer(req);
      if (token) await redis('DEL', SESSION_KEY(token));
      return res.status(200).json({ ok: true });
    }

    const me = await requireUser(req, res);
    if (!me) return;
    if (action === 'me') return res.status(200).json({ user: me });
    if (action === 'profiles') {
      const ids = (Array.isArray(body.ids) ? body.ids : []).slice(0, 100).map(String);
      const out = {};
      if (ids.length) {
        const rows = await redis('HMGET', USERS_KEY, ...ids);
        ids.forEach((id, i) => { try { if (rows[i]) out[id] = { name: JSON.parse(rows[i]).name }; } catch (e) {} });
      }
      return res.status(200).json(out);
    }
    return res.status(400).json({ error: 'Aksi tidak dikenal' });
  } catch (e) {
    console.error(`[auth] ${action} error:`, e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
