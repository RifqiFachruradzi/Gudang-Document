'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Label, Textarea } from './ui';

// Dialog konfirmasi untuk tindakan yang tidak bisa dibatalkan, opsional dengan kolom alasan.
export function ConfirmDialog({
  open, title, children, confirmLabel, danger, reasonLabel, onConfirm, onClose,
}: {
  open: boolean;
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  reasonLabel?: string;
  onConfirm: (reason: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { setReason(''); d.showModal(); }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-xl border border-line bg-panel p-0 text-ink shadow-2xl backdrop:bg-black/50"
    >
      <form
        method="dialog"
        className="p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (reasonLabel && !reason.trim()) return;
          setBusy(true);
          try { await onConfirm(reason.trim()); } finally { setBusy(false); }
        }}
      >
        <h3 className="mb-2 text-xl font-semibold">{title}</h3>
        {children && <div className="mb-3 text-[15px] text-muted">{children}</div>}
        {reasonLabel && (
          <div className="mb-3">
            <Label htmlFor="dlg-reason">{reasonLabel}</Label>
            <Textarea id="dlg-reason" required value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-20" autoFocus />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={busy || (!!reasonLabel && !reason.trim())}>{busy ? 'Memproses…' : confirmLabel}</Button>
        </div>
      </form>
    </dialog>
  );
}
