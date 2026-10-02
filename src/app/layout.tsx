import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import './globals.css';

const barlow = Barlow({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-barlow', display: 'swap' });
const barlowCondensed = Barlow_Condensed({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-barlow-condensed', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Gudang tanpa kertas', template: '%s · Gudang tanpa kertas' },
  description: 'Penerimaan barang dengan AI: pencocokan PO, surat jalan, dan barang fisik, tanda tangan digital, stok real-time.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#15212B',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
