'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, cachedUser, clearSession, errMsg, getToken } from '@/lib/client';
import { atLeast, type GRN, type PublicUser, type ReceiveInput, type Role, type Snapshot } from '@/lib/types';

interface AppState {
  me: PublicUser;
  can: (r: Role) => boolean;
  data: Snapshot | null;
  tol: number;
  names: Record<string, string>;
  resolveNames: (ids: (string | undefined)[]) => void;
  refresh: () => Promise<void>;
  /** Jalankan aksi di server (lihat ACTIONS di /api/data), lalu sinkronkan data. */
  act: <T = Record<string, unknown>>(action: string, payload?: Record<string, unknown>) => Promise<T>;
  receive: (input: ReceiveInput) => Promise<GRN>;
  approve: (id: string) => Promise<GRN>;
  signature: (id: string) => Promise<string | null>;
  logout: () => Promise<void>;
  toast: (msg: string) => void;
  screen: Record<string, unknown>;
  setScreen: (s: Record<string, unknown>) => void;
}

const Ctx = createContext<AppState | null>(null);
export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp dipakai di luar AppProvider');
  return c;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<PublicUser | null>(null);
  const [data, setData] = useState<Snapshot | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [toastMsg, setToastMsg] = useState<{ text: string; id: number } | null>(null);
  const [screen, setScreen] = useState<Record<string, unknown>>({});
  const verRef = useRef(0);
  const inflight = useRef<Promise<void> | null>(null);
  const pendingNames = useRef(new Set<string>());

  const toast = useCallback((text: string) => setToastMsg({ text, id: Date.now() }), []);
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 3200);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Sesi: tanpa token langsung ke halaman masuk; profil terbaru (termasuk peran) diambil dari server.
  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    const c = cachedUser();
    if (c) setMe(c);
    api<{ user: PublicUser }>('/api/auth', { json: { action: 'me' } })
      .then((r) => {
        setMe(r.user);
        try { localStorage.setItem('gudang-ai-user', JSON.stringify(r.user)); } catch { /* abaikan */ }
      })
      .catch(() => {
        if (!c) router.replace('/login');
      });
  }, [router]);

  // Sinkronisasi: cek nomor versi tiap 5 detik, unduh ulang hanya bila ada perubahan.
  const refresh = useCallback(() => {
    if (!inflight.current) {
      inflight.current = (async () => {
        try {
          const r = await api<Snapshot & { same?: boolean }>('/api/data' + (verRef.current ? '?since=' + verRef.current : ''));
          if (r.same) return;
          verRef.current = r.ver;
          setData(r);
        } catch (e) {
          if (!verRef.current) toast(errMsg(e, 'Gagal memuat data gudang'));
        }
      })().finally(() => { inflight.current = null; });
    }
    return inflight.current;
  }, [toast]);

  useEffect(() => {
    if (!getToken()) return;
    refresh();
    const t = setInterval(() => { if (!document.hidden) refresh(); }, 5000);
    const onVis = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [refresh]);

  const resolveNames = useCallback((ids: (string | undefined)[]) => {
    const need = [...new Set(ids.filter(Boolean) as string[])].filter((i) => !(i in names) && !pendingNames.current.has(i));
    if (!need.length) return;
    need.forEach((i) => pendingNames.current.add(i));
    api<Record<string, { name: string }>>('/api/auth', { json: { action: 'profiles', ids: need } })
      .then((ps) => setNames((n) => {
        const o = { ...n };
        need.forEach((i) => { o[i] = ps[i]?.name || i; });
        return o;
      }))
      .catch(() => need.forEach((i) => pendingNames.current.delete(i)));
  }, [names]);

  const value = useMemo<AppState | null>(() => {
    if (!me) return null;
    const act = async <T,>(action: string, payload: Record<string, unknown> = {}) => {
      const r = await api<T>('/api/data', { json: { action, ...payload } });
      await refresh();
      return r;
    };
    return {
      me,
      can: (r) => atLeast(me.role, r),
      data,
      tol: Number(data?.config.settings?.toleransi ?? 2),
      names,
      resolveNames,
      refresh,
      act,
      receive: async (input) => (await act<{ grn: GRN }>('receive', { ...input })).grn,
      approve: async (id) => (await act<{ grn: GRN }>('approve', { id })).grn,
      signature: (id) => api<{ ttd: string | null }>('/api/data?ttd=' + encodeURIComponent(id)).then((r) => r.ttd),
      logout: async () => {
        try { await api('/api/auth', { json: { action: 'logout' } }); } catch { /* tetap keluar */ }
        clearSession();
        router.replace('/login');
      },
      toast,
      screen,
      setScreen,
    };
  }, [me, data, names, resolveNames, refresh, router, toast, screen]);

  if (!value) {
    return (
      <div className="grid min-h-screen place-items-center text-muted">
        <p>Memuat…</p>
      </div>
    );
  }
  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed bottom-[calc(84px+env(safe-area-inset-bottom))] left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 font-medium text-bg shadow-lg transition-opacity md:bottom-7 ${toastMsg ? 'opacity-100' : 'opacity-0'}`}
      >
        {toastMsg?.text}
      </div>
    </Ctx.Provider>
  );
}
