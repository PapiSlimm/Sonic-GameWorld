import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '../src/components/layout/Providers.js';
import { SiteFooter } from '../src/components/layout/SiteFooter.js';
import { SiteHeader } from '../src/components/layout/SiteHeader.js';
import './globals.css';

export const metadata: Metadata = {
  title: 'GameWorld Market — Sonic GameWorld OS',
  description: 'The Spatial Operating System for Creating, Publishing, Discovering, and Monetizing Interactive Worlds.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-bg text-text antialiased">
        <Providers>
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
        </Providers>
      </body>
    </html>
  );
}
