// Utilitas bersama: cek kata sandi dan akses Upstash Redis lewat REST.
export function checkAuth(req, res) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) {
    res.status(500).json({ error: 'APP_PASSWORD belum diatur di Environment Variables Vercel' });
    return false;
  }
  if (req.headers['x-app-password'] !== pw) {
    res.status(401).json({ error: 'Kata sandi salah' });
    return false;
  }
  return true;
}

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
