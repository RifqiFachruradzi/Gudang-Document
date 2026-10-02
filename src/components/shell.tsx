'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ClipboardList, Layers, LayoutGrid, LogOut, PackageCheck, RotateCcwClock, ShieldCheck, User } from 'lucide-react';
import { ROLE_LABEL, type Role } from '@/lib/types';
import { useApp } from './app-provider';
import { cn, Logo } from './ui';

const NAV: { href: string; label: string; short: string; icon: typeof LayoutGrid; role?: Role }[] = [
  { href: '/', label: 'Beranda', short: 'Beranda', icon: LayoutGrid },
  { href: '/terima', label: 'Terima barang', short: 'Terima', icon: PackageCheck },
  { href: '/po', label: 'Purchase order', short: 'PO', icon: ClipboardList },
  { href: '/stok', label: 'Stok', short: 'Stok', icon: Layers },
  { href: '/riwayat', label: 'Riwayat', short: 'Riwayat', icon: RotateCcwClock },
  { href: '/admin', label: 'Admin', short: 'Admin', icon: ShieldCheck, role: 'admin' },
];

const TITLES: [string, string, string][] = [
  ['/terima', 'Terima barang', 'Verifikasi kiriman terhadap PO dan surat jalan'],
  ['/po', 'Purchase order', 'Daftar PO dan aturan verifikasi'],
  ['/stok', 'Stok', 'Jumlah barang per lokasi rak'],
  ['/riwayat', 'Riwayat penerimaan', 'Bukti terima digital (GRN)'],
  ['/akun', 'Akun saya', 'Profil dan kata sandi'],
  ['/admin', 'Admin', 'Pengguna dan log audit'],
];

const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { me, can } = useApp();
  const nav = NAV.filter((n) => !n.role || can(n.role));
  const [title, sub] = (TITLES.find(([p]) => isActive(path, p)) || ['', 'Beranda', 'Ringkasan aktivitas gudang']).slice(1);

  return (
    <>
      <div className="hazard no-print fixed inset-x-0 top-0 z-40 h-(--hz)" aria-hidden />
      <div className="flex min-h-screen pt-(--hz) print:pt-0">
        <aside className="no-print sticky top-(--hz) hidden h-[calc(100vh-var(--hz))] w-62 shrink-0 flex-col bg-side px-3 py-5 text-side-ink lg:flex" aria-label="Navigasi utama">
          <Link href="/" className="mb-6 flex items-center gap-2.5 px-2.5">
            <Logo className="size-9" />
            <span>
              <b className="block font-display text-2xl leading-none text-white">Gudang</b>
              <span className="text-xs tracking-[.08em] text-side-mute uppercase">Tanpa kertas</span>
            </span>
          </Link>
          <nav className="flex flex-col gap-0.5">
            {nav.map((n) => {
              const active = isActive(path, n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-medium transition-colors hover:bg-side-hover hover:text-white',
                    active && 'bg-side-hover text-white before:absolute before:inset-y-2 before:-left-3 before:w-1 before:rounded-r before:bg-accent',
                  )}
                >
                  <n.icon className={cn('size-5', active && 'text-accent')} strokeWidth={1.8} />
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <p className="mt-auto px-2.5 text-xs leading-snug text-side-mute">Data tersimpan bersama untuk tim gudang</p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print sticky top-(--hz) z-30 flex items-center gap-3 border-b border-line bg-panel px-4 py-2.5 lg:px-7 lg:py-3">
            <Link href="/" className="lg:hidden" aria-label="Beranda">
              <Logo className="size-9" />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold leading-tight lg:text-2xl">{title}</h1>
              <p className="truncate text-[13px] text-muted">{sub}</p>
            </div>
            <UserMenu name={me.name} email={me.email} role={me.role} />
          </header>
          <main className="w-full max-w-295 flex-1 px-4 pt-5 pb-28 lg:px-7 lg:pt-6 lg:pb-10 print:p-0">{children}</main>
        </div>
      </div>

      <nav className="no-print fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Menu utama">
        {nav.map((n) => {
          const active = isActive(path, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex min-h-14.5 flex-1 flex-col items-center justify-center gap-0.5 text-[11.5px] font-semibold',
                active ? 'text-ink before:absolute before:inset-x-[22%] before:top-0 before:h-[3px] before:rounded-b before:bg-accent' : 'text-muted',
              )}
            >
              <n.icon className="size-5.5" strokeWidth={1.8} />
              {n.short}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function UserMenu({ name, email, role }: { name: string; email: string; role: Role }) {
  const { logout } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btn}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menu akun ${name}`}
        className="flex min-h-11 items-center gap-2.5 rounded-full border border-transparent p-1 hover:border-line hover:bg-soft aria-expanded:border-line aria-expanded:bg-soft lg:pr-2"
      >
        <span className="grid size-9 place-items-center rounded-full bg-accent font-display text-base font-bold text-accent-ink">{initials}</span>
        <span className="hidden flex-col items-start leading-tight lg:flex">
          <b className="max-w-40 truncate text-sm font-semibold">{name}</b>
          <span className="text-xs text-muted">{ROLE_LABEL[role]}</span>
        </span>
        <ChevronDown className="hidden size-4 text-muted lg:block" />
      </button>
      {open && (
        <div role="menu" className="absolute top-[calc(100%+6px)] right-0 z-50 min-w-60 rounded-xl border border-line bg-panel p-1.5 shadow-xl">
          <div className="mb-1.5 border-b border-line px-2.5 pt-2 pb-2.5">
            <b className="block">{name}</b>
            <span className="text-[13px] break-all text-muted">{email} · {ROLE_LABEL[role]}</span>
          </div>
          <Link role="menuitem" href="/akun" onClick={() => setOpen(false)} className="flex min-h-10 items-center gap-2.5 rounded-md px-2.5 font-medium hover:bg-soft">
            <User className="size-5" strokeWidth={1.8} /> Akun saya
          </Link>
          <button role="menuitem" onClick={logout} className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 font-medium text-bad hover:bg-soft">
            <LogOut className="size-5" strokeWidth={1.8} /> Keluar
          </button>
        </div>
      )}
    </div>
  );
}
