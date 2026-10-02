// Utilitas server: akses Upstash Redis lewat REST, cek sesi login, peran, dan log audit.
import { atLeast, ROLE_LABEL, type PublicUser, type Role } from '@/lib/types';

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function redis<T = any>(...cmd: (string | number)[]): Promise<T> {
  if (!URL_ || !TOKEN) throw new Error('Database Redis belum terhubung (KV_REST_API_URL / KV_REST_API_TOKEN)');
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd.map(String)),
    cache: 'no-store',
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result as T;
}

export const SESSION_KEY = (t: string) => `gudang:session:${t}`;
export const USERS_KEY = 'gudang:users';
export const AUDIT_KEY = 'gudang:audit';

export interface StoredUser extends PublicUser {
  salt: string;
  hash: string;
  passwordChanged?: boolean;
}

export function publicUser(u: Partial<StoredUser> & { email: string; name: string }): PublicUser {
  return { email: u.email, name: u.name, role: u.role || 'petugas', status: u.status || 'active' };
}

export function parseHash<T>(arr: string[] | null): Record<string, T> {
  const o: Record<string, T> = {};
  for (let i = 0; i < (arr || []).length; i += 2) {
    try { o[arr![i]] = JSON.parse(arr![i + 1]); } catch { /* lewati data rusak */ }
  }
  return o;
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const fail = (status: number, error: string) => Response.json({ error }, { status });

export function bearer(req: Request): string | null {
  const m = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(req.headers.get('authorization') || '');
  return m ? m[1] : null;
}

// Mengembalikan pengguna aktif yang login, atau Response 401/403 untuk langsung dikembalikan.
export async function requireUser(req: Request, minRole: Role = 'viewer'): Promise<PublicUser | Response> {
  const token = bearer(req);
  const email = token ? await redis<string | null>('GET', SESSION_KEY(token)) : null;
  const raw = email ? await redis<string | null>('HGET', USERS_KEY, email) : null;
  if (!raw || !token) return fail(401, 'Silakan masuk terlebih dahulu');
  const u = publicUser(JSON.parse(raw));
  if (u.status !== 'active') {
    await redis('DEL', SESSION_KEY(token));
    return fail(401, u.status === 'pending' ? 'Akun menunggu persetujuan admin' : 'Akun dinonaktifkan');
  }
  if (!atLeast(u.role, minRole)) return fail(403, `Butuh peran ${ROLE_LABEL[minRole]} atau lebih tinggi`);
  return u;
}

// Catat perubahan ke log audit (5.000 entri terakhir disimpan).
export async function audit(user: { email?: string; name?: string } | null, aksi: string, detail: string) {
  try {
    const entry = { waktu: new Date().toISOString(), email: user?.email || '-', nama: user?.name || '-', aksi, detail };
    await redis('LPUSH', AUDIT_KEY, JSON.stringify(entry));
    await redis('LTRIM', AUDIT_KEY, 0, 4999);
  } catch (e) {
    console.error('[audit] gagal mencatat:', e);
  }
}

// Bungkus handler agar error tak terduga selalu dibalas JSON.
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (e) {
      console.error(`[api] ${new URL(req.url).pathname} error:`, e);
      return fail(500, String((e as Error)?.message || e));
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}
