'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Eye, EyeOff } from 'lucide-react';
import { Button, cn, Input, Label, Logo } from '@/components/ui';
import { getToken, setSession } from '@/lib/client';
import type { PublicUser } from '@/lib/types';

const FEATURES = [
  'Cocokkan PO, surat jalan, dan barang fisik otomatis',
  'AI membaca surat jalan dan memeriksa foto barang',
  'Tanda tangan digital dan bukti terima (GRN)',
  'Stok real-time, persetujuan supervisor, log audit',
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'bad' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (getToken()) router.replace('/'); }, [router]);
  useEffect(() => { (mode === 'register' ? first : emailRef).current?.focus(); }, [mode]);

  const reg = mode === 'register';
  const switchMode = (m: 'login' | 'register') => { setMode(m); setMsg(null); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const pw = password.trim();
    if (reg && !name.trim()) return setMsg({ tone: 'bad', text: 'Nama wajib diisi.' });
    if (!email.trim()) return setMsg({ tone: 'bad', text: 'Email wajib diisi.' });
    if (pw.length < 8) return setMsg({ tone: 'bad', text: 'Kata sandi minimal 8 karakter.' });
    if (reg && pw !== confirm.trim()) return setMsg({ tone: 'bad', text: 'Kedua kata sandi tidak sama.' });
    setBusy(true);
    try {
      const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: mode, email: email.trim(), password: pw, name: name.trim() }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; pending?: boolean; message?: string; token?: string; user?: PublicUser };
      if (!r.ok) return setMsg({ tone: 'bad', text: j.error || `Gagal (${r.status}). Coba lagi.` });
      if (j.pending) {
        switchMode('login');
        setPassword('');
        setConfirm('');
        return setMsg({ tone: 'ok', text: j.message || 'Pendaftaran terkirim.' });
      }
      setSession(j.token!, j.user!);
      router.replace('/');
    } catch {
      setMsg({ tone: 'bad', text: 'Tidak bisa terhubung ke server. Periksa koneksi internet.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(380px,44%)_1fr]">
      <aside className="relative hidden flex-col overflow-hidden border-t-[6px] border-accent bg-[#15212B] px-12 py-9 text-[#C9D3DA] lg:flex">
        <div className="flex items-center gap-3">
          <Logo className="size-10.5" />
          <div>
            <b className="block font-display text-[26px] leading-none text-white">Gudang</b>
            <span className="text-xs tracking-[.08em] text-[#7F909C] uppercase">Tanpa kertas</span>
          </div>
        </div>
        <div className="my-auto max-w-110">
          <h2 className="mb-6 text-[40px] leading-[1.08] font-bold text-white">Penerimaan barang yang tercatat rapi, tanpa kertas.</h2>
          <ul className="grid gap-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5"><Check className="mt-0.5 size-5 shrink-0 text-accent" strokeWidth={2.4} />{f}</li>
            ))}
          </ul>
        </div>
        <p className="mb-3.5 text-[13px] text-[#7F909C]">Gudang tanpa kertas · Sistem penerimaan barang</p>
        <div className="hazard absolute inset-x-0 bottom-0 h-3" aria-hidden />
      </aside>

      <main className="mx-auto w-full max-w-105 self-center px-4 py-10">
        <div className="mb-6 flex items-center gap-2.5 lg:hidden">
          <Logo className="size-9.5" />
          <b className="font-display text-[22px]">Gudang tanpa kertas</b>
        </div>
        <h1 className="mb-1.5 text-[32px] leading-tight font-bold">{reg ? 'Buat akun baru' : 'Masuk ke akun Anda'}</h1>
        <p className="mb-6 text-muted">Akun baru aktif setelah disetujui admin gudang.</p>

        <div className="rounded-xl border border-line bg-panel p-5">
          <div className="mb-4 flex gap-1.5 rounded-lg border border-line bg-soft p-1" role="tablist">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={cn('min-h-10.5 flex-1 rounded-md font-display text-[19px] font-semibold', mode === m ? 'bg-panel text-ink shadow-sm' : 'text-muted')}
              >
                {m === 'login' ? 'Masuk' : 'Daftar'}
              </button>
            ))}
          </div>
          <form onSubmit={submit} noValidate className="space-y-3.5">
            {msg && <p role="alert" className={cn('rounded-lg px-3 py-2.5 text-sm', msg.tone === 'bad' ? 'bg-bad-bg text-bad' : 'bg-ok-bg text-ok')}>{msg.text}</p>}
            {reg && (
              <div><Label htmlFor="name">Nama lengkap</Label><Input ref={first} id="name" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input ref={emailRef} id="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="password">Kata sandi</Label>
              <div className="relative">
                <Input id="password" type={show ? 'text' : 'password'} autoComplete={reg ? 'new-password' : 'current-password'} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-13" />
                <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} className="absolute top-1 right-1 grid h-9.5 w-11 place-items-center rounded-md text-muted hover:text-ink">
                  {show ? <EyeOff className="size-5.5" /> : <Eye className="size-5.5" />}
                </button>
              </div>
            </div>
            {reg && (
              <div><Label htmlFor="confirm">Ulangi kata sandi</Label><Input id="confirm" type={show ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
            )}
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>{busy ? 'Memproses…' : reg ? 'Daftar' : 'Masuk'}</Button>
          </form>
          <p className="mt-3.5 text-center text-sm text-muted">
            {reg ? 'Sudah punya akun? ' : 'Belum punya akun? '}
            <button type="button" className="font-semibold text-ink underline" onClick={() => switchMode(reg ? 'login' : 'register')}>{reg ? 'Masuk' : 'Daftar'}</button>
          </p>
        </div>
      </main>
    </div>
  );
}
