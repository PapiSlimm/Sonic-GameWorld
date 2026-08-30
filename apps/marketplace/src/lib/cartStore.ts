'use client';

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

// `localStorage` doesn't exist during Next.js server rendering. Every store
// consumer is a 'use client' component, which is still rendered once on the
// server for the initial HTML, so the persist middleware needs a storage
// that's safe to construct there — this in-memory stand-in is used only for
// that one server pass and is replaced by real `localStorage` in the browser.
const memoryStorage = new Map<string, string>();
const ssrSafeStorage: StateStorage = {
  getItem: (key) => (typeof window !== 'undefined' ? window.localStorage.getItem(key) : (memoryStorage.get(key) ?? null)),
  setItem: (key, value) => (typeof window !== 'undefined' ? window.localStorage.setItem(key, value) : void memoryStorage.set(key, value)),
  removeItem: (key) => (typeof window !== 'undefined' ? window.localStorage.removeItem(key) : void memoryStorage.delete(key)),
};

export interface CartLine {
  productId: string;
  quantity: number;
  addedAt: string;
}

export interface LibraryEntry {
  productId: string;
  orderId: string;
  acquiredAt: string;
}

interface MarketplaceState {
  cart: CartLine[];
  wishlist: string[];
  library: LibraryEntry[];
  addToCart: (productId: string) => void;
  removeFromCart: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  toggleWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  isInLibrary: (productId: string) => boolean;
  /** Mock checkout: moves every cart line into the library and empties the cart. */
  completeMockCheckout: () => string;
}

/**
 * Client-side cart/wishlist/library state, persisted to `localStorage`.
 *
 * There is no authenticated session in this offline-first build, so a
 * "purchase" is a mock: `completeMockCheckout` grants library access to
 * everything in the cart immediately, mirroring the real flow
 * (`POST /v1/orders` → `POST /v1/payments/checkout` → `PLAYER_PURCHASED_ASSET`)
 * without a live backend.
 */
export const useMarketplaceStore = create<MarketplaceState>()(
  persist(
    (set, get) => ({
      cart: [],
      wishlist: [],
      library: [],

      addToCart: (productId) =>
        set((state) => {
          if (state.cart.some((l) => l.productId === productId)) return state;
          return { cart: [...state.cart, { productId, quantity: 1, addedAt: new Date().toISOString() }] };
        }),

      removeFromCart: (productId) => set((state) => ({ cart: state.cart.filter((l) => l.productId !== productId) })),

      setQuantity: (productId, quantity) =>
        set((state) => ({
          cart: state.cart.map((l) => (l.productId === productId ? { ...l, quantity: Math.max(1, quantity) } : l)),
        })),

      clearCart: () => set({ cart: [] }),

      toggleWishlist: (productId) =>
        set((state) => ({
          wishlist: state.wishlist.includes(productId)
            ? state.wishlist.filter((id) => id !== productId)
            : [...state.wishlist, productId],
        })),

      isInWishlist: (productId) => get().wishlist.includes(productId),
      isInLibrary: (productId) => get().library.some((l) => l.productId === productId),

      completeMockCheckout: () => {
        const orderId = `order_mock_${Date.now().toString(36)}`;
        const acquiredAt = new Date().toISOString();
        set((state) => ({
          library: [
            ...state.library,
            ...state.cart
              .filter((l) => !state.library.some((existing) => existing.productId === l.productId))
              .map((l) => ({ productId: l.productId, orderId, acquiredAt })),
          ],
          cart: [],
        }));
        return orderId;
      },
    }),
    {
      name: 'gw-marketplace-store',
      version: 1,
      storage: createJSONStorage(() => ssrSafeStorage),
      // Rehydrated explicitly from <Providers> after mount (see hydrateMarketplaceStore)
      // so the very first client render matches the server-rendered (empty) HTML.
      skipHydration: true,
    },
  ),
);

/** Call once from a client-only effect (see `<Providers>`) to load persisted state. */
export function hydrateMarketplaceStore(): void {
  void useMarketplaceStore.persist.rehydrate();
}
