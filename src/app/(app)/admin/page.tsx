'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { Button, Card, Chip, Note, PageTitle } from '@/components/ui';
import { api, errMsg } from '@/lib/client';
import { ROLE_LABEL, ROLES, type AuditEntry, type PublicUser, type Role, type UserStatus } from '@/lib/types';

const STATUS_CHIP: Record<UserStatus, React.ReactNode> = {
  active: <Chip tone="ok">Aktif</Chip>,
  pending: <Chip tone="warn">Menunggu</Chip>,
  disabled: <Chip tone="bad">Nonaktif</Chip>,
};

export default function AdminPage() {
  const { me, can, toast } = useApp();
  const [d, setD] = useState<{ users: PublicUser[]; audit: AuditEntry[] } | null>(null);
  const [roles, setRoles] = useState<Record<string, Role>>({});

  const load = useCallback(async () => {
    try {
      setD(await api('/api/admin'));
    } catch (e) {
      toast(errMsg(e, 'Gagal memuat data admin'));
      setD({ users: [], audit: [] });
    }
  }, [toast]);
  useEffect(() => { if (can('admin')) load(); }, [can, load]);

  if (!can('admin')) return <Card><p className="m-0 text-muted">Halaman ini khusus Admin.</p></Card>;
  if (!d) return <p className="text-muted">Memuat data pengguna…</p>;

  async function update(email: string, patch: { role?: Role; status?: UserStatus }) {
    try {
      await api('/api/admin', { json: { email, ...patch } });
      toast('Perubahan disimpan');
      load();
    } catch (e) {
      toast(errMsg(e, 'Gagal menyimpan perubahan'));
    }
  }
  const pending = d.users.filter((u) => u.status === 'pending').length;

  return (
    <>
      <PageTitle action={<Button onClick={load}><RefreshCw className="size-4" /> Muat ulang</Button>}>Pengguna</PageTitle>
      {pending > 0 && <Note className="mb-3">{pending} akun menunggu persetujuan. Pilih perannya, lalu tekan Setujui.</Note>}
      <Card className="mb-6 p-0">
        <ul className="divide-y divide-line">
          {d.users.map((u) => {
            const self = u.email === me.email;
            const role = roles[u.email] || u.role;
            return (
              <li key={u.email} className="grid gap-2 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <b>{u.name}</b> {STATUS_CHIP[u.status]}
                  <div className="text-sm break-all text-muted">{u.email}</div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                  {self ? (
                    <span className="text-sm text-muted">Akun Anda · {ROLE_LABEL[u.role]}</span>
                  ) : (
                    <>
                      <select
                        aria-label={`Peran ${u.name}`}
                        value={role}
                        onChange={(e) => {
                          const r = e.target.value as Role;
                          setRoles((x) => ({ ...x, [u.email]: r }));
                          if (u.status !== 'pending') update(u.email, { role: r });
                        }}
                        className="min-h-9.5 rounded-lg border border-line bg-soft px-2"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                      {u.status === 'pending' ? (
                        <>
                          <Button size="sm" variant="primary" onClick={() => update(u.email, { status: 'active', role })}>Setujui</Button>
                          <Button size="sm" variant="danger" onClick={() => update(u.email, { status: 'disabled' })}>Tolak</Button>
                        </>
                      ) : u.status === 'active' ? (
                        <Button size="sm" variant="danger" onClick={() => update(u.email, { status: 'disabled' })}>Nonaktifkan</Button>
                      ) : (
                        <Button size="sm" onClick={() => update(u.email, { status: 'active' })}>Aktifkan</Button>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <PageTitle>Log audit</PageTitle>
      <p className="-mt-3 mb-3 text-sm text-muted">300 aktivitas terakhir: siapa mengubah apa dan kapan.</p>
      <Card className="p-0">
        {d.audit.length ? (
          <ul className="divide-y divide-line">
            {d.audit.map((a, i) => (
              <li key={i} className="px-5 py-2.5 text-sm">
                <time className="block text-[13px] text-muted">{new Date(a.waktu).toLocaleString('id-ID')}</time>
                <b>{a.nama}</b> <span className="text-muted">{a.aksi}</span>
                <div className="break-words">{a.detail}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 p-5 text-muted">Belum ada aktivitas.</p>
        )}
      </Card>
    </>
  );
}
