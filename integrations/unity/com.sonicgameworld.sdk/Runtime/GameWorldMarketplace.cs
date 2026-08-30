using System;
using System.Collections;
using System.Text;
using SonicGameWorld.Models;

namespace SonicGameWorld
{
    /// <summary>
    /// Browse, search and purchase marketplace products (CONTRACTS.md §9 "marketplace").
    /// Used by the in-editor marketplace browser (<c>GameWorldWindow</c>) and, at runtime,
    /// by anything that wants to let a player buy/import UGC directly from the game.
    /// </summary>
    public sealed class GameWorldMarketplace
    {
        private readonly GameWorldHttp _http;

        internal GameWorldMarketplace(GameWorldHttp http)
        {
            _http = http;
        }

        /// <summary>`GET /v1/marketplace/search?q=&category=&genre=&engine=&cursor=&limit=`</summary>
        public IEnumerator Search(
            string query,
            string category,
            Action<MarketplaceSearchResult> onSuccess,
            Action<GameWorldApiException> onError,
            string genre = null,
            string engine = EngineTarget.Unity,
            string cursor = null,
            int limit = 20)
        {
            var qs = new StringBuilder("/marketplace/search?limit=").Append(limit);
            if (!string.IsNullOrEmpty(query)) qs.Append("&q=").Append(UnityEngine.Networking.UnityWebRequest.EscapeURL(query));
            if (!string.IsNullOrEmpty(category)) qs.Append("&category=").Append(category);
            if (!string.IsNullOrEmpty(genre)) qs.Append("&genre=").Append(genre);
            if (!string.IsNullOrEmpty(engine)) qs.Append("&engine=").Append(engine);
            if (!string.IsNullOrEmpty(cursor)) qs.Append("&cursor=").Append(cursor);

            yield return _http.Get(qs.ToString(), onSuccess, onError);
        }

        /// <summary>`GET /v1/marketplace/featured`</summary>
        public IEnumerator Featured(Action<MarketplaceSearchResult> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Get("/marketplace/featured", onSuccess, onError);
        }

        /// <summary>`GET /v1/products/:slug`</summary>
        public IEnumerator GetProduct(string slug, Action<ProductDetail> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Get($"/products/{slug}", onSuccess, onError);
        }

        /// <summary>`POST /v1/cart/items`</summary>
        public IEnumerator AddToCart(string productId, string versionId, Action onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Post<GameWorldVoid>("/cart/items", new { productId, versionId }, _ => onSuccess?.Invoke(), onError);
        }

        /// <summary>`POST /v1/orders` — checks out the current cart (or a direct product/version pair when supplied).</summary>
        public IEnumerator Checkout(Action<Order> onSuccess, Action<GameWorldApiException> onError, string productId = null, string versionId = null)
        {
            object body = productId != null ? new { productId, versionId } : null;
            yield return _http.Post("/orders", body, onSuccess, onError);
        }

        /// <summary>`GET /v1/library` — products the current user already owns and can import.</summary>
        public IEnumerator GetLibrary(Action<Page<LibraryEntry>> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Get("/library", onSuccess, onError);
        }

        /// <summary>
        /// Convenience "import" helper for the Editor marketplace browser: verifies ownership via
        /// the library, then resolves the product's world/asset document ready for
        /// <see cref="GameWorldWorldLoader"/> to load. Downloads the document itself using
        /// <c>GET /v1/worlds/:id/document</c> when the product wraps a World.
        /// </summary>
        public IEnumerator ImportProduct(string productId, Action<WorldDocument> onSuccess, Action<GameWorldApiException> onError)
        {
            ProductDetail resolved = null;
            GameWorldApiException failure = null;

            yield return GetProduct(productId, p => resolved = p, e => failure = e);
            if (failure != null) { onError?.Invoke(failure); yield break; }
            if (resolved == null)
            {
                onError?.Invoke(new GameWorldApiException(404, "NOT_FOUND", "Product not found"));
                yield break;
            }

            if (resolved.category != ProductCategory.World)
            {
                onError?.Invoke(new GameWorldApiException(400, "UNSUPPORTED_CATEGORY",
                    $"ImportProduct currently supports WORLD products only (got {resolved.category})."));
                yield break;
            }

            yield return _http.Get<WorldDocument>($"/worlds/{resolved.id}/document", onSuccess, onError);
        }
    }
}
