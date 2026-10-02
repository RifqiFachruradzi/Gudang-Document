import { AUDIT_KEY, audit, body, fail, handle, json, publicUser, redis, requireUser, USERS_KEY, type StoredUser } from '@/server/core';
import { ROLE_LABEL, ROLES, type AuditEntry, type PublicUser, type Role, type UserStatus } from '@/lib/types';

const STATUSES: UserStatus[] = ['active', 'pending', 'disabled'];
const STATUS_LABEL: Record<UserStatus, string> = { active: 'aktif', pending: 'menunggu', disabled: 'nonaktif' };

// Khusus admin: daftar pengguna dan log audit.
export const GET = handle(async (req) => {
  const me = await requireUser(req, 'admin');
  if (me instanceof Response) return me;
  const raw = await redis<string[]>('HGETALL', USERS_KEY);
  const users: PublicUser[] = [];
  for (let i = 0; i < (raw || []).length; i += 2) {
    try {
      const u = JSON.parse(raw[i + 1]) as StoredUser;
      users.push({ ...publicUser(u), created: u.created || null });
    } catch { /* lewati */ }
  }
  users.sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || a.name.localeCompare(b.name));
  const log = ((await redis<string[]>('LRANGE', AUDIT_KEY, 0, 299)) || [])
    .map((s) => { try { return JSON.parse(s) as AuditEntry; } catch { return null; } })
    .filter(Boolean);
  return json({ users, audit: log });
});

// Khusus admin: ubah peran dan status pengguna lain.
export const POST = handle(async (req) => {
  const me = await requireUser(req, 'admin');
  if (me instanceof Response) return me;
  const { email, role, status } = await body<{ email?: string; role?: Role; status?: UserStatus }>(req);
  const raw = email ? await redis<string | null>('HGET', USERS_KEY, String(email)) : null;
  if (!raw) return fail(404, 'Pengguna tidak ditemukan');
  if (email === me.email) return fail(400, 'Anda tidak bisa mengubah peran atau status akun sendiri');
  if (role !== undefined && !ROLES.includes(role)) return fail(400, 'Peran tidak valid');
  if (status !== undefined && !STATUSES.includes(status)) return fail(400, 'Status tidak valid');
  const u = JSON.parse(raw) as StoredUser;
  const changes: string[] = [];
  if (role !== undefined && role !== (u.role || 'petugas')) {
    changes.push(`peran ${ROLE_LABEL[u.role || 'petugas']} → ${ROLE_LABEL[role]}`);
    u.role = role;
  }
  if (status !== undefined && status !== (u.status || 'active')) {
    changes.push(`status ${STATUS_LABEL[u.status || 'active']} → ${STATUS_LABEL[status]}`);
    u.status = status;
  }
  if (changes.length) {
    await redis('HSET', USERS_KEY, u.email, JSON.stringify(u));
    await audit(me, 'kelola pengguna', `${u.email}: ${changes.join(', ')}`);
  }
  return json({ user: publicUser(u) });
});
