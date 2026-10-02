import { fmt, normalizePO } from '@/lib/evaluate';
import type { PO } from '@/lib/types';
import { Chip } from './ui';

const TONE = { Terbuka: 'neutral', Sebagian: 'warn', Diterima: 'ok', Ditutup: 'neutral', Dibatalkan: 'bad' } as const;

export function POStatusChip({ po }: { po: PO }) {
  const s = normalizePO(po).status;
  return <Chip tone={TONE[s]}>{s === 'Sebagian' ? 'Diterima sebagian' : s === 'Ditutup' ? 'Ditutup (sisa dibatalkan)' : s}</Chip>;
}

// Progres penerimaan PO: total barang baik yang diterima dibanding total dipesan.
export function POProgress({ po }: { po: PO }) {
  const p = normalizePO(po);
  const total = p.items.reduce((a, i) => a + i.qty, 0);
  const got = p.items.reduce((a, i) => a + Math.min(i.qty, p.diterima[i.sku] || 0), 0);
  const pct = total ? Math.round((got / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[13px] text-muted">
        <span>Diterima {fmt(got)} dari {fmt(total)} unit</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progres penerimaan">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
