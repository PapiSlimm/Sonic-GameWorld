'use client';

import type { ReactNode } from 'react';
import { ToastProvider } from '@sonic-gameworld/ui';
import { GlobalCommandPalette } from './GlobalCommandPalette';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <GlobalCommandPalette />
    </ToastProvider>
  );
}
