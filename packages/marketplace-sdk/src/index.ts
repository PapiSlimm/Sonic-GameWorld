export const PACKAGE_NAME = '@sonic-gameworld/marketplace-sdk';

import { createClient, type GameWorldClient, type GameWorldClientOptions } from '@sonic-gameworld/gameworld-sdk';

export type {
  AddCartItemInput, Cart, CartItem, CreateOrderInput, CreateOrderResult, CreateProductInput,
  CreateProductVersionInput, CreateReviewInput, FeaturedResponse, LibraryItem, LibraryQuery,
  LicenseCheckInput, LicenseCheckResult, MarketplaceMap, MarketplaceSearchQuery, Order, OrderListQuery,
  Product, ProductLicense, ProductPatch, ProductSummary, ProductVersion, RefundInput, Review,
  SearchResult, WishlistItem,
} from '@sonic-gameworld/gameworld-sdk';
export { ApiError } from '@sonic-gameworld/gameworld-sdk';
export {
  PRODUCT_CATEGORIES, GENRES, ENGINE_TARGETS, SPATIAL_HIERARCHY, checkLicenseCompatibility, LICENSE_PRESETS,
  type ProductCategory, type Genre, type EngineTarget, type LicenseRecord, type LicenseCompatibility,
} from '@sonic-gameworld/world-schema';

/**
 * The marketplace-facing namespaces of {@link GameWorldClient}: spatial discovery, products,
 * cart, orders, wishlist, library and license checks (§9 `marketplace:`, `licensing:`).
 */
export interface MarketplaceClient {
  marketplace: GameWorldClient['marketplace'];
  products: GameWorldClient['products'];
  wishlist: GameWorldClient['wishlist'];
  cart: GameWorldClient['cart'];
  orders: GameWorldClient['orders'];
  library: GameWorldClient['library'];
  licenses: GameWorldClient['licenses'];
}

/**
 * Create a scoped client exposing only the marketplace/commerce routes.
 * Thin wrapper over `@sonic-gameworld/gameworld-sdk`'s `createClient(options)`.
 */
export function createMarketplaceClient(options: GameWorldClientOptions): MarketplaceClient {
  const client = createClient(options);
  return {
    marketplace: client.marketplace,
    products: client.products,
    wishlist: client.wishlist,
    cart: client.cart,
    orders: client.orders,
    library: client.library,
    licenses: client.licenses,
  };
}

/** Escape hatch to the full client when other SDKs (assets/ai) are also needed. */
export function createFullClient(options: GameWorldClientOptions): GameWorldClient {
  return createClient(options);
}
