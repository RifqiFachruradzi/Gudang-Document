import { redis, requireUser, audit, publicUser, ROLES, ROLE_LABEL, USERS_KEY, AUDIT_KEY } from '../lib/common.js';

const STATUSES = ['active', 'pending', 'disabled'];
const STATUS_LABEL = { active: 'aktif', pending: 'menunggu', disabled: 'nonaktif' };

// Khusus admin: daftar pengguna, ubah peran/status, dan baca log audit.
export default async function handler(req, res) {
  const me = await requireUser(req, res, 'admin');
  if (!me) return;
  try {
    if (req.method === 'GET') {
      const raw = await redis('HGETALL', USERS_KEY);
      const users = [];
      for (let i = 0; i < (raw || []).length; i += 2) {
        try { const u = JSON.parse(raw[i + 1]); users.push({ ...publicUser(u), created: u.created || null }); } catch (e) {}
      }
      users.sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0) || a.name.localeCompare(b.name));
      const log = ((await redis('LRANGE', AUDIT_KEY, 0, 299)) || []).map((s) => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
      return res.status(200).json({ users, audit: log });
    }

    if (req.method === 'POST') {
      const { email, role, status } = req.body || {};
      const raw = email ? await redis('HGET', USERS_KEY, String(email)) : null;
      if (!raw) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
      if (email === me.email) return res.status(400).json({ error: 'Anda tidak bisa mengubah peran atau status akun sendiri' });
      if (role !== undefined && !ROLES.includes(role)) return res.status(400).json({ error: 'Peran tidak valid' });
      if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: 'Status tidak valid' });
      const u = JSON.parse(raw);
      const changes = [];
      if (role !== undefined && role !== (u.role || 'petugas')) { changes.push(`peran ${ROLE_LABEL[u.role || 'petugas']} → ${ROLE_LABEL[role]}`); u.role = role; }
      if (status !== undefined && status !== (u.status || 'active')) { changes.push(`status ${STATUS_LABEL[u.status || 'active']} → ${STATUS_LABEL[status]}`); u.status = status; }
      if (changes.length) {
        await redis('HSET', USERS_KEY, u.email, JSON.stringify(u));
        await audit(me, 'kelola pengguna', `${u.email}: ${changes.join(', ')}`);
      }
      return res.status(200).json({ user: publicUser(u) });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Metode tidak didukung' });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
