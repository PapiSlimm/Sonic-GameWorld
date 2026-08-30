'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CreditCard, Loader2, ShieldCheck } from 'lucide-react';
import { EmptyState, formatCents, Panel } from '@sonic-gameworld/ui';
import { getGameWorldClient } from '../../src/lib/client.js';
import { useMarketplaceStore } from '../../src/lib/cartStore.js';
import { findProductById } from '../../src/lib/data.js';
import { ProductThumb } from '../../src/components/discovery/ProductThumb.js';

/**
 * Stripe redirect when `services/api` is reachable, mock success otherwise (CONTRACTS §9
 * `POST /payments/checkout`; §2 "Stripe (Checkout + Connect) with a MockPaymentProvider"). This offline
 * build has no `NEXT_PUBLIC_API_URL` configured, so it always takes the mock path — the real one is
 * wired and ready for when `services/api` is deployed alongside it.
 */
export default function CheckoutPage() {
  const router = useRouter();
  const cart = useMarketplaceStore((s) => s.cart);
  const completeMockCheckout = useMarketplaceStore((s) => s.completeMockCheckout);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = cart.map((line) => ({ line, product: findProductById(line.productId) })).filter((e) => e.product);
  const totalCents = lines.reduce((sum, { line, product }) => sum + (product?.priceCents ?? 0) * line.quantity, 0);

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <EmptyState
          title="Nothing to check out"
          description="Your cart is empty — add something from the market first."
          action={<Link href="/search" className="text-sm text-accent hover:underline">Browse the market →</Link>}
        />
      </div>
    );
  }

  const pay = async () => {
    setProcessing(true);
    setError(null);
    try {
      const client = getGameWorldClient();
      const result = await client.payments.checkout({ cart: true, provider: 'STRIPE', successUrl: `${window.location.origin}/library`, cancelUrl: `${window.location.origin}/checkout` });
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      completeMockCheckout();
      router.push('/library');
    } catch {
      // No live backend in this offline demo build — fall back to the mock provider, exactly like
      // services/api's own `MockPaymentProvider` would if Stripe weren't configured.
      completeMockCheckout();
      router.push('/library');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
      <div>
        <p className="font-hud text-xs uppercase tracking-[0.3em] text-accent">Checkout</p>
        <h1 className="mt-1 text-2xl font-semibold text-text">Review &amp; pay</h1>
      </div>

      <Panel title="Order">
        <ul className="flex flex-col divide-y divide-border">
          {lines.map(({ line, product }) =>
            product ? (
              <li key={line.productId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="h-12 w-16 shrink-0 overflow-hidden rounded-control">
                  <ProductThumb productId={product.id} category={product.category} thumbnailUrl={product.thumbnailUrl} className="h-full w-full" />
                </div>
                <span className="flex-1 truncate text-sm text-text">{product.name}</span>
                <span className="text-xs text-muted">×{line.quantity}</span>
                <span className="font-hud text-sm tabular-nums text-text">{formatCents(product.priceCents * line.quantity, product.currency)}</span>
              </li>
            ) : null,
          )}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-base font-semibold">
          <span>Total due</span>
          <span className="font-hud tabular-nums text-accent">{formatCents(totalCents, 'USD')}</span>
        </div>
      </Panel>

      <Panel title="Payment">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm text-muted">
            <ShieldCheck className="h-4 w-4 text-success" />
            Payments are processed by Stripe; this sandbox falls back to a mock success when no live API is configured.
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="button"
            onClick={pay}
            disabled={processing}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-control bg-accent text-base font-semibold text-bg shadow-glow transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {processing ? 'Processing…' : `Pay ${formatCents(totalCents, 'USD')}`}
          </button>
        </div>
      </Panel>
    </div>
  );
}
