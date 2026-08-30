using SonicGameWorld;
using UnityEngine;

namespace SonicGameWorld.Samples
{
    /// <summary>
    /// Attach to an empty GameObject in a fresh scene. On Play: signs in with a dev-login email,
    /// searches the marketplace for "world" category products, and loads the first result into
    /// the scene. Requires a locally running GameWorld API (`pnpm dev` from the monorepo, or point
    /// <see cref="baseUrl"/> at a deployed environment) with NODE_ENV != production for dev-login.
    /// </summary>
    public sealed class GameWorldQuickStart : MonoBehaviour
    {
        [SerializeField] private string baseUrl = "http://localhost:4000";
        [SerializeField] private string devEmail = "quickstart@example.com";

        private GameWorldClient _client;

        private void Start()
        {
            _client = GameWorldClient.GetOrCreate(GameWorldConfig.CreateDefault(baseUrl));
            StartCoroutine(_client.Auth.DevLogin(devEmail, OnSignedIn, OnError));
        }

        private void OnSignedIn(SonicGameWorld.Models.AuthUser user)
        {
            Debug.Log($"[GameWorld QuickStart] Signed in as {user.displayName} ({user.tier}).");
            StartCoroutine(_client.Marketplace.Search(
                query: "",
                category: SonicGameWorld.Models.ProductCategory.World,
                onSuccess: OnSearchResults,
                onError: OnError));
        }

        private void OnSearchResults(SonicGameWorld.Models.MarketplaceSearchResult result)
        {
            Debug.Log($"[GameWorld QuickStart] Found {result.total} world(s).");
            if (result.items.Count == 0) return;

            var first = result.items[0];
            StartCoroutine(_client.Marketplace.ImportProduct(first.id, OnWorldLoaded, OnError));
        }

        private void OnWorldLoaded(SonicGameWorld.Models.WorldDocument document)
        {
            StartCoroutine(_client.WorldLoader.Instantiate(document, null, root =>
            {
                Debug.Log($"[GameWorld QuickStart] Loaded '{document.name}' with {document.entities.Count} entities into '{root.name}'.");
            }));
        }

        private void OnError(GameWorldApiException error)
        {
            Debug.LogError($"[GameWorld QuickStart] {error}");
        }
    }
}
