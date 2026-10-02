'use client';

// Unduh CSV dengan pemisah titik koma (format Excel Indonesia) dan BOM agar huruf tampil benar.
export function downloadCSV(name: string, rows: (string | number | null | undefined)[][]) {
  const cell = (v: unknown) => {
    const t = String(v ?? '');
    return /[",;\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const csv = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

export const today = () => new Date().toISOString().slice(0, 10);
