import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '../components/shell/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'GameWorld Studio — Sonic GameWorld OS',
  description: 'The Spatial Operating System for Creating, Publishing, Discovering, and Monetizing Interactive Worlds.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-bg text-text antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
