import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/AppShell';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'dInges — Ingest Service',
  description: 'Vanguard REOS · Data Ingestion & Approval Pipeline',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`} style={{ background: '#1b1e23', color: '#eff0f1' }}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
