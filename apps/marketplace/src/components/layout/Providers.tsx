'use client';

import { ToastProvider } from '@sonic-gameworld/ui';
import { useEffect, type ReactNode } from 'react';
import { hydrateMarketplaceStore } from '../../lib/cartStore.js';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    hydrateMarketplaceStore();
  }, []);
  return <ToastProvider>{children}</ToastProvider>;
}
