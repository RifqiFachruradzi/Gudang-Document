// Utilitas bersama: akses Upstash Redis lewat REST dan cek sesi login.
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

export function bearer(req) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(req.headers.authorization || '');
  return m ? m[1] : null;
}

// Mengembalikan data pengguna yang login, atau mengirim 401 dan mengembalikan null.
export async function requireUser(req, res) {
  try {
    const token = bearer(req);
    const email = token ? await redis('GET', SESSION_KEY(token)) : null;
    const raw = email ? await redis('HGET', USERS_KEY, email) : null;
    if (raw) {
      const u = JSON.parse(raw);
      return { email: u.email, name: u.name };
    }
    res.status(401).json({ error: 'Silakan masuk terlebih dahulu' });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
  return null;
}
