'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ClipboardCheck, ClipboardList, Database, Ellipsis, Layers, LayoutGrid, LogOut, PackageCheck, RotateCcwClock, ShieldCheck, Truck, User, X } from 'lucide-react';
import { ROLE_LABEL, type Role } from '@/lib/types';
import { useApp } from './app-provider';
import { cn, Logo } from './ui';

interface NavItem { href: string; label: string; short: string; icon: typeof LayoutGrid; role?: Role; group: string; mobile?: boolean }
const NAV: NavItem[] = [
  { href: '/', label: 'Beranda', short: 'Beranda', icon: LayoutGrid, group: '', mobile: true },
  { href: '/terima', label: 'Terima barang', short: 'Terima', icon: PackageCheck, group: 'Operasional', mobile: true },
  { href: '/keluar', label: 'Barang keluar', short: 'Keluar', icon: Truck, group: 'Operasional', mobile: true },
  { href: '/opname', label: 'Stok opname', short: 'Opname', icon: ClipboardCheck, group: 'Operasional' },
  { href: '/po', label: 'Purchase order', short: 'PO', icon: ClipboardList, group: 'Data' },
  { href: '/stok', label: 'Stok', short: 'Stok', icon: Layers, group: 'Data', mobile: true },
  { href: '/riwayat', label: 'Riwayat penerimaan', short: 'Riwayat', icon: RotateCcwClock, group: 'Data' },
  { href: '/master', label: 'Master data', short: 'Master', icon: Database, group: 'Data' },
  { href: '/admin', label: 'Admin', short: 'Admin', icon: ShieldCheck, role: 'admin', group: 'Sistem' },
];

const TITLES: [string, string, string][] = [
  ['/terima', 'Terima barang', 'Verifikasi kiriman terhadap PO dan surat jalan'],
  ['/keluar', 'Barang keluar', 'Pengiriman ke pelanggan, cabang, atau pemakaian internal'],
  ['/opname', 'Stok opname', 'Hitung fisik dan penyesuaian stok'],
  ['/po', 'Purchase order', 'Pesanan ke supplier dan progres penerimaannya'],
  ['/stok', 'Stok', 'Jumlah barang per lokasi rak dan kartu stok'],
  ['/master', 'Master data', 'Barang dan supplier'],
  ['/riwayat', 'Riwayat penerimaan', 'Bukti terima digital (GRN)'],
  ['/akun', 'Akun saya', 'Profil dan kata sandi'],
  ['/admin', 'Admin', 'Pengguna dan log audit'],
];

const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { me, can } = useApp();
  const nav = NAV.filter((n) => !n.role || can(n.role));
  const [more, setMore] = useState(false);
  const bottomCls = (active: boolean) =>
    cn(
      'relative flex min-h-14.5 flex-1 flex-col items-center justify-center gap-0.5 text-[11.5px] font-semibold',
      active ? 'text-ink before:absolute before:inset-x-[22%] before:top-0 before:h-[3px] before:rounded-b before:bg-accent' : 'text-muted',
    );
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
          <nav className="flex flex-col gap-0.5 overflow-y-auto">
            {nav.map((n, i) => {
              const active = isActive(path, n.href);
              return (
                <div key={n.href}>
                  {n.group && n.group !== nav[i - 1]?.group && <p className="mt-4 mb-1 px-3 text-[11px] font-semibold tracking-[.1em] text-side-mute uppercase">{n.group}</p>}
                  <Link
                    href={n.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex min-h-10.5 items-center gap-3 rounded-lg px-3 text-[15px] font-medium transition-colors hover:bg-side-hover hover:text-white',
                      active && 'bg-side-hover text-white before:absolute before:inset-y-2 before:-left-3 before:w-1 before:rounded-r before:bg-accent',
                    )}
                  >
                    <n.icon className={cn('size-5', active && 'text-accent')} strokeWidth={1.8} />
                    {n.label}
                  </Link>
                </div>
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
        {nav.filter((n) => n.mobile).map((n) => {
          const active = isActive(path, n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined} className={bottomCls(active)}>
              <n.icon className="size-5.5" strokeWidth={1.8} />
              {n.short}
            </Link>
          );
        })}
        <button onClick={() => setMore(true)} aria-haspopup="dialog" className={bottomCls(nav.some((n) => !n.mobile && isActive(path, n.href)))}>
          <Ellipsis className="size-5.5" strokeWidth={1.8} />
          Lainnya
        </button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu lainnya">
          <button className="absolute inset-0 bg-black/40" aria-label="Tutup menu" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-panel p-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mb-2 flex items-center justify-between px-2">
              <b className="font-display text-xl">Menu lainnya</b>
              <button onClick={() => setMore(false)} className="grid size-10 place-items-center rounded-lg hover:bg-soft" aria-label="Tutup"><X className="size-5" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {nav.filter((n) => !n.mobile).map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setMore(false)} aria-current={isActive(path, n.href) ? 'page' : undefined} className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border border-line px-1 text-center text-[13px] font-semibold aria-[current=page]:border-accent aria-[current=page]:bg-warn-bg">
                  <n.icon className="size-6" strokeWidth={1.8} />
                  {n.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
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
