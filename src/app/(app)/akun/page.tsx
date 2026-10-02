'use client';

import { useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Button, Card, Input, Label, PageTitle } from '@/components/ui';
import { api, errMsg } from '@/lib/client';
import { ROLE_LABEL } from '@/lib/types';

export default function AkunPage() {
  const { me, toast } = useApp();
  const [form, setForm] = useState({ old: '', next: '', again: '' });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.next.trim().length < 8) return toast('Kata sandi baru minimal 8 karakter');
    if (form.next.trim() !== form.again.trim()) return toast('Kedua kata sandi baru tidak sama');
    setSaving(true);
    try {
      await api('/api/auth', { json: { action: 'password', old: form.old, new: form.next } });
      toast('Kata sandi sudah diganti');
      setForm({ old: '', next: '', again: '' });
    } catch (err) {
      toast(errMsg(err, 'Gagal mengganti kata sandi'));
    }
    setSaving(false);
  }

  return (
    <div className="max-w-xl">
      <PageTitle>Akun saya</PageTitle>
      <Card className="mb-4">
        <p className="m-0 text-lg font-semibold">{me.name}</p>
        <p className="m-0 text-sm text-muted">{me.email} · {ROLE_LABEL[me.role]}</p>
      </Card>
      <Card>
        <h3 className="mb-3 text-xl font-semibold">Ganti kata sandi</h3>
        <form onSubmit={submit} className="space-y-3">
          <div><Label htmlFor="pwold">Kata sandi lama</Label><Input id="pwold" type="password" autoComplete="current-password" autoCapitalize="none" value={form.old} onChange={(e) => setForm({ ...form, old: e.target.value })} /></div>
          <div><Label htmlFor="pwnew">Kata sandi baru (minimal 8 karakter)</Label><Input id="pwnew" type="password" autoComplete="new-password" autoCapitalize="none" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} /></div>
          <div><Label htmlFor="pwnew2">Ulangi kata sandi baru</Label><Input id="pwnew2" type="password" autoComplete="new-password" autoCapitalize="none" value={form.again} onChange={(e) => setForm({ ...form, again: e.target.value })} /></div>
          <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan kata sandi baru'}</Button>
        </form>
      </Card>
    </div>
  );
}
