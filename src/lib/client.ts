'use client';

import type { PublicUser } from './types';

const TOKEN_KEY = 'gudang-ai-token';
const USER_KEY = 'gudang-ai-user';

export function getToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
export function setSession(token: string, user: PublicUser) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch { /* penyimpanan diblokir */ }
}
export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch { /* abaikan */ }
}
export function cachedUser(): PublicUser | null {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}

export type ApiCode = 'not_granted' | 'forbidden' | 'rate_limited' | 'image_rejected' | 'invalid_argument' | 'conflict' | 'unavailable' | 'cancelled';
export class ApiError extends Error {
  constructor(public code: ApiCode, message: string, public status = 0) {
    super(message);
  }
}

// Panggil API aplikasi dengan token sesi. Sesi yang berakhir mengarahkan ke halaman masuk.
export async function api<T = unknown>(path: string, opts: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...init } = opts;
  const res = await fetch(path, {
    ...init,
    method: init.method || (json !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken(), ...(init.headers || {}) },
    body: json !== undefined ? JSON.stringify(json) : init.body,
    cache: 'no-store',
  });
  if (res.status === 401 && !path.startsWith('/api/auth')) {
    clearSession();
    if (typeof window !== 'undefined') window.location.replace('/login');
    throw new ApiError('not_granted', 'Sesi berakhir, silakan masuk lagi', 401);
  }
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json()).error || ''; } catch { /* bukan JSON */ }
    const code: ApiCode =
      res.status === 429 || res.status === 529 ? 'rate_limited'
      : res.status === 413 ? 'image_rejected'
      : res.status === 403 ? 'forbidden'
      : res.status === 409 ? 'conflict'
      : res.status === 400 ? 'invalid_argument'
      : res.status === 401 ? 'not_granted'
      : 'unavailable';
    throw new ApiError(code, msg || 'HTTP ' + res.status, res.status);
  }
  return res.json() as Promise<T>;
}

export const errMsg = (e: unknown, fallback = 'Terjadi kesalahan. Coba lagi.') => (e instanceof Error && e.message) || fallback;
