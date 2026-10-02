import { forwardRef } from 'react';
import type { Keputusan, RowStatus } from '@/lib/types';

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
type Size = 'sm' | 'md' | 'lg';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink border-accent hover:brightness-95',
  secondary: 'bg-panel text-ink border-line hover:bg-soft',
  ghost: 'bg-transparent text-ink border-transparent hover:bg-soft',
  danger: 'bg-panel text-bad border-line hover:bg-bad-bg',
  link: 'bg-transparent border-transparent text-ink underline underline-offset-4 px-0! min-h-0!',
};
const SIZE: Record<Size, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4',
  lg: 'min-h-12 px-5 text-lg',
};

export const buttonClass = (variant: Variant = 'secondary', size: Size = 'md', className?: string) =>
  cn('inline-flex items-center justify-center gap-2 rounded-lg border font-semibold transition-colors disabled:opacity-50', VARIANT[variant], SIZE[size], className);

export const Button = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }>(
  function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...p }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={buttonClass(variant, size, className)}
        {...p}
      />
    );
  },
);

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-line bg-panel p-5 shadow-[0_1px_2px_rgba(21,33,43,.05)]', className)} {...p} />;
}

export function CardHeader({ title, action, className }: { title: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <h3 className="text-lg font-semibold">{title}</h3>
      {action}
    </div>
  );
}

type Tone = 'ok' | 'warn' | 'bad' | 'neutral';
const TONE: Record<Tone, string> = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  neutral: 'bg-soft text-muted border-line',
};
export function Chip({ tone = 'neutral', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-full border border-transparent px-2.5 py-0.5 text-[13px] font-semibold', TONE[tone], className)}>{children}</span>;
}

export const keputusanTone = (k: Keputusan, hasil?: string): Tone => (k === 'Ditahan' ? 'bad' : hasil === 'Diterima' ? 'ok' : 'warn');

export const STATUS_CHIP: Record<RowStatus, React.ReactNode> = {
  sesuai: <Chip tone="ok">Sesuai</Chip>,
  catatan: <Chip tone="warn">Dalam toleransi</Chip>,
  tahan: <Chip tone="bad">Ditahan</Chip>,
  belum: <Chip tone="bad">Belum discan</Chip>,
  kosong: <Chip>Tidak dikirim</Chip>,
};

// Cap keputusan penerimaan. Status Ditahan diberi strip peringatan seperti rambu di gudang.
export function Stamp({ tone, title, sub }: { tone: Tone; title: string; sub?: string }) {
  const color = tone === 'ok' ? 'text-ok bg-ok-bg' : tone === 'bad' ? 'text-bad bg-bad-bg' : 'text-warn bg-warn-bg';
  return (
    <div className={cn('relative overflow-hidden rounded-xl border-[3px] border-current px-4 py-3 font-display', color, tone === 'bad' && 'pt-5')}>
      {tone === 'bad' && <div className="hazard absolute inset-x-0 top-0 h-2" aria-hidden />}
      <div className="text-3xl font-bold leading-tight">{title}</div>
      {sub && <div className="mt-1 font-sans text-sm font-medium">{sub}</div>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn('min-h-11 w-full rounded-lg border border-line bg-soft px-3 py-2 text-ink placeholder:text-muted disabled:opacity-60', className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn('min-h-24 w-full rounded-lg border border-line bg-soft px-3 py-2 text-ink placeholder:text-muted', className)} {...p} />;
});

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1 block text-sm text-muted', className)} {...p} />;
}

export function Note({ tone = 'warn', className, children }: { tone?: 'warn' | 'bad' | 'ok'; className?: string; children: React.ReactNode }) {
  return <div className={cn('rounded-lg px-3 py-2.5 text-sm', tone === 'warn' ? 'bg-warn-bg text-warn' : tone === 'bad' ? 'bg-bad-bg text-bad' : 'bg-ok-bg text-ok', className)}>{children}</div>;
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="8" fill="#F2B705" />
      <path d="M16 6.5 25 11v10l-9 4.5L7 21V11l9-4.5Z" fill="#15212B" />
      <path d="m7 11 9 4.5 9-4.5M16 15.5v10" fill="none" stroke="#F2B705" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function Mascot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <line x1="32" y1="6" x2="32" y2="14" stroke="#15212B" strokeWidth="2.5" />
      <circle cx="32" cy="6" r="3.5" fill="#F2B705" stroke="#15212B" strokeWidth="2" />
      <path d="M10 22 L32 14 L54 22 L54 50 L32 58 L10 50 Z" fill="#C8955A" stroke="#15212B" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M10 22 L32 30 L54 22" fill="none" stroke="#15212B" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M32 30 L32 58" stroke="#15212B" strokeWidth="2" />
      <rect x="14" y="34" width="36" height="8" fill="#F2B705" />
      <circle cx="23" cy="45" r="3" fill="#15212B" />
      <circle cx="41" cy="45" r="3" fill="#15212B" />
      <path d="M27 51 Q32 54 37 51" fill="none" stroke="#15212B" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PageTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-2xl font-semibold">{children}</h2>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-sm text-muted">{children}</p>;
}
