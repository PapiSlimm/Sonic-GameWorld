'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Heart, ShoppingCart } from 'lucide-react';
import { Button, PriceTag, useToast } from '@sonic-gameworld/ui';
import { useMarketplaceStore } from '../../lib/cartStore.js';
import type { DemoProduct } from '../../lib/types.js';

/** Buy / Add to cart / Wishlist — the primary conversion controls on `/p/[slug]`. */
export function ProductActions({ product }: { product: DemoProduct }) {
  const router = useRouter();
  const { push } = useToast();
  const inCart = useMarketplaceStore((s) => s.cart.some((l) => l.productId === product.id));
  const inWishlist = useMarketplaceStore((s) => s.wishlist.includes(product.id));
  const inLibrary = useMarketplaceStore((s) => s.library.some((l) => l.productId === product.id));
  const addToCart = useMarketplaceStore((s) => s.addToCart);
  const toggleWishlist = useMarketplaceStore((s) => s.toggleWishlist);

  if (inLibrary) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-control border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          <Check className="h-4 w-4" /> Already in your library
        </div>
        <Link href="/library" className="text-sm text-accent hover:underline">
          Go to library →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <PriceTag cents={product.priceCents} currency={product.currency} size="lg" />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          onClick={() => {
            addToCart(product.id);
            router.push('/checkout');
          }}
        >
          Buy now
        </Button>
        <Button
          variant="secondary"
          leftIcon={<ShoppingCart className="h-4 w-4" />}
          disabled={inCart}
          onClick={() => {
            addToCart(product.id);
            push({ title: 'Added to cart', description: product.name, tone: 'success' });
          }}
        >
          {inCart ? 'In cart' : 'Add to cart'}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
          onClick={() => toggleWishlist(product.id)}
        >
          <Heart className={inWishlist ? 'h-4 w-4 fill-danger text-danger' : 'h-4 w-4'} />
        </Button>
      </div>
    </div>
  );
}
