import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VorScore — Football Predictions',
  description: 'Auto-generated daily football predictions ranked by confidence.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
