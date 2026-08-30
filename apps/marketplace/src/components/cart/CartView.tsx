'use client';

import Link from 'next/link';
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { EmptyState, formatCents, PriceTag } from '@sonic-gameworld/ui';
import { useMarketplaceStore } from '../../lib/cartStore.js';
import { findProductById } from '../../lib/data.js';
import { ProductThumb } from '../discovery/ProductThumb.js';

export function CartView() {
  const cart = useMarketplaceStore((s) => s.cart);
  const removeFromCart = useMarketplaceStore((s) => s.removeFromCart);
  const setQuantity = useMarketplaceStore((s) => s.setQuantity);

  const lines = cart
    .map((line) => ({ line, product: findProductById(line.productId) }))
    .filter((entry): entry is { line: (typeof cart)[number]; product: NonNullable<ReturnType<typeof findProductById>> } => Boolean(entry.product));

  if (lines.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingCart className="h-8 w-8" />}
        title="Your cart is empty"
        description="Browse the market and add worlds, games or assets to your cart."
        action={
          <Link href="/search" className="text-sm text-accent hover:underline">
            Start browsing →
          </Link>
        }
      />
    );
  }

  const subtotalCents = lines.reduce((sum, { line, product }) => sum + product.priceCents * line.quantity, 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <ul className="flex flex-col gap-3">
        {lines.map(({ line, product }) => (
          <li key={line.productId} className="flex items-center gap-4 rounded-panel border border-border bg-panel p-3">
            <Link href={`/p/${product.slug}`} className="h-16 w-24 shrink-0 overflow-hidden rounded-control">
              <ProductThumb productId={product.id} category={product.category} thumbnailUrl={product.thumbnailUrl} className="h-full w-full" />
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/p/${product.slug}`} className="truncate text-sm font-medium text-text hover:text-accent">
                {product.name}
              </Link>
              <div className="mt-0.5 text-xs text-muted">{product.creator.displayName}</div>
            </div>
            <div className="flex items-center gap-1.5 rounded-control border border-border">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => setQuantity(product.id, line.quantity - 1)}
                className="p-1.5 text-muted hover:text-text"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-5 text-center text-sm tabular-nums">{line.quantity}</span>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => setQuantity(product.id, line.quantity + 1)}
                className="p-1.5 text-muted hover:text-text"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <PriceTag cents={product.priceCents * line.quantity} currency={product.currency} size="sm" className="w-20 justify-end" />
            <button type="button" aria-label="Remove" onClick={() => removeFromCart(product.id)} className="text-muted hover:text-danger">
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-4 rounded-panel border border-border bg-panel p-4">
        <h2 className="font-hud text-xs uppercase tracking-[0.2em] text-muted">Order summary</h2>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Subtotal</span>
          <span className="font-hud tabular-nums text-text">{formatCents(subtotalCents, 'USD')}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Platform fee</span>
          <span className="text-muted">Calculated at checkout</span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3 text-base font-semibold">
          <span>Total</span>
          <span className="font-hud tabular-nums text-accent">{formatCents(subtotalCents, 'USD')}</span>
        </div>
        <Link
          href="/checkout"
          className="flex h-12 w-full items-center justify-center rounded-control bg-accent text-base font-semibold text-bg shadow-glow transition-colors hover:bg-accent/90"
        >
          Proceed to checkout
        </Link>
      </div>
    </div>
  );
}
