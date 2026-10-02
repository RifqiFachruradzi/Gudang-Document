// Utilitas bersama: akses Upstash Redis lewat REST, cek sesi login, peran, dan log audit.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export async function redis(...cmd) {
  if (!URL_ || !TOKEN) throw new Error('Database Redis belum terhubung (KV_REST_API_URL / KV_REST_API_TOKEN)');
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

export const SESSION_KEY = (t) => `gudang:session:${t}`;
export const USERS_KEY = 'gudang:users';
export const AUDIT_KEY = 'gudang:audit';

// Urutan peran dari yang paling terbatas. Viewer hanya melihat, petugas menerima barang,
// supervisor menyetujui penerimaan yang ditahan dan mengatur PO, admin mengelola pengguna.
export const ROLES = ['viewer', 'petugas', 'supervisor', 'admin'];
export const ROLE_LABEL = { viewer: 'Viewer', petugas: 'Petugas', supervisor: 'Supervisor', admin: 'Admin' };
export const atLeast = (user, role) => ROLES.indexOf(user?.role) >= ROLES.indexOf(role);

export function publicUser(u) {
  return { email: u.email, name: u.name, role: u.role || 'petugas', status: u.status || 'active' };
}

export function bearer(req) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(req.headers.authorization || '');
  return m ? m[1] : null;
}

// Mengembalikan pengguna aktif yang login (dengan perannya), atau mengirim 401/403 dan mengembalikan null.
export async function requireUser(req, res, minRole = 'viewer') {
  try {
    const token = bearer(req);
    const email = token ? await redis('GET', SESSION_KEY(token)) : null;
    const raw = email ? await redis('HGET', USERS_KEY, email) : null;
    if (!raw) {
      res.status(401).json({ error: 'Silakan masuk terlebih dahulu' });
      return null;
    }
    const u = publicUser(JSON.parse(raw));
    if (u.status !== 'active') {
      await redis('DEL', SESSION_KEY(token));
      res.status(401).json({ error: u.status === 'pending' ? 'Akun menunggu persetujuan admin' : 'Akun dinonaktifkan' });
      return null;
    }
    if (!atLeast(u, minRole)) {
      res.status(403).json({ error: `Butuh peran ${ROLE_LABEL[minRole]} atau lebih tinggi` });
      return null;
    }
    return u;
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
  return null;
}

// Catat perubahan data ke log audit (5.000 entri terakhir disimpan).
export async function audit(user, aksi, detail) {
  try {
    const entry = { waktu: new Date().toISOString(), email: user?.email || '-', nama: user?.name || '-', aksi, detail };
    await redis('LPUSH', AUDIT_KEY, JSON.stringify(entry));
    await redis('LTRIM', AUDIT_KEY, 0, 4999);
  } catch (e) {
    console.error('[audit] gagal mencatat:', e);
  }
}
