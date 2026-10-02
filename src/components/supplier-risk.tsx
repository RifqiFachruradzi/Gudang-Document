import type { GRN } from '@/lib/types';
import { Chip } from './ui';

// Risiko supplier dari persentase kiriman yang tidak sesuai PO (minimal 2 kiriman).
export function SupplierRisk({ supplier, grn }: { supplier: string; grn: Record<string, GRN> }) {
  const g = Object.values(grn).filter((x) => x.supplier === supplier);
  if (g.length < 2) return <Chip>Riwayat supplier belum cukup</Chip>;
  const r = g.filter((x) => x.hasil !== 'Diterima').length / g.length;
  const level = r >= 0.5 ? 'tinggi' : r >= 0.25 ? 'sedang' : 'rendah';
  return (
    <Chip tone={level === 'tinggi' ? 'bad' : level === 'sedang' ? 'warn' : 'ok'}>
      Risiko supplier {level} ({Math.round(r * 100)}% dari {g.length} kiriman bermasalah)
    </Chip>
  );
}
