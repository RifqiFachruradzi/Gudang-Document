'use client';

import { useEffect, useRef } from 'react';

// Kotak tanda tangan dengan jari, stylus, atau mouse. Hasilnya gambar PNG (data URL).
export function SignaturePad({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, c.width, c.height);
    if (value) {
      const im = new Image();
      im.onload = () => x.drawImage(im, 0, 0);
      im.src = value;
    }
  }, [value]);

  const pt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) * c.width) / r.width, ((e.clientY - r.top) * c.height) / r.height] as const;
  };
  const ctx = () => {
    const x = ref.current!.getContext('2d')!;
    x.lineWidth = 3;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    x.strokeStyle = '#15212B';
    return x;
  };

  return (
    <canvas
      ref={ref}
      width={700}
      height={180}
      aria-label="Kotak tanda tangan"
      className="block h-37.5 w-full touch-none rounded-lg border border-dashed border-muted bg-white"
      onPointerDown={(e) => {
        drawing.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        const [a, b] = pt(e);
        const x = ctx();
        x.beginPath();
        x.moveTo(a, b);
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        const [a, b] = pt(e);
        const x = ctx();
        x.lineTo(a, b);
        x.stroke();
      }}
      onPointerUp={() => {
        if (!drawing.current) return;
        drawing.current = false;
        onChange(ref.current!.toDataURL('image/png'));
      }}
      onPointerCancel={() => { drawing.current = false; }}
    />
  );
}
