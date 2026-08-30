using System;
using System.Collections;
using System.Collections.Generic;
using SonicGameWorld.Models;

namespace SonicGameWorld
{
    /// <summary>Options describing what the caller intends to do with a set of licensed assets.</summary>
    [Serializable]
    public sealed class LicenseIntent
    {
        public bool commercial;
        public bool multiplayer;
        public bool redistribute;
        public bool modify;
    }

    /// <summary>
    /// Licensing &amp; Asset Passport lookups (CONTRACTS.md §6 LicenseRecord/AssetPassport, §9 "licensing").
    /// Every asset imported through <see cref="GameWorldWorldLoader"/> or the Editor marketplace
    /// browser should be checked here before being bundled into a shipped build.
    /// </summary>
    public sealed class GameWorldLicense
    {
        private readonly GameWorldHttp _http;

        internal GameWorldLicense(GameWorldHttp http)
        {
            _http = http;
        }

        /// <summary>`GET /v1/licenses/:id`</summary>
        public IEnumerator GetLicense(string licenseId, Action<LicenseRecord> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Get($"/licenses/{licenseId}", onSuccess, onError);
        }

        /// <summary>`GET /v1/licenses/product/:productId`</summary>
        public IEnumerator GetLicenseForProduct(string productId, Action<LicenseRecord> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Get($"/licenses/product/{productId}", onSuccess, onError);
        }

        /// <summary>
        /// `POST /v1/licenses/check` — server-side compatibility engine. Prefer this over
        /// <see cref="CheckCompatibilityLocal"/> for anything that gates a real purchase or publish
        /// action, since the server is the source of truth and may apply platform-side overrides.
        /// </summary>
        public IEnumerator CheckCompatibility(
            List<LicenseRecord> licenses,
            LicenseIntent intent,
            Action<LicenseCompatibilityResult> onSuccess,
            Action<GameWorldApiException> onError)
        {
            yield return _http.Post("/licenses/check", new { licenses, intent }, onSuccess, onError);
        }

        /// <summary>`GET /v1/assets/:id/passport`</summary>
        public IEnumerator GetAssetPassport(string assetId, Action<AssetPassport> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Get($"/assets/{assetId}/passport", onSuccess, onError);
        }

        /// <summary>
        /// Same rule set as <c>checkLicenseCompatibility</c> in <c>@sonic-gameworld/world-schema</c>,
        /// evaluated locally for instant UI feedback (e.g. while dragging an asset into a scene,
        /// before round-tripping to the server). GREEN if every license permits the intent, RED if
        /// any explicitly forbids it, YELLOW for attribution-only friction.
        /// </summary>
        public static LicenseCompatibilityResult CheckCompatibilityLocal(List<LicenseRecord> licenses, LicenseIntent intent)
        {
            var reasons = new List<string>();
            var worst = "GREEN";

            foreach (var license in licenses)
            {
                if (intent.commercial && !license.commercial)
                {
                    reasons.Add($"License '{license.id}' does not permit commercial use.");
                    worst = "RED";
                }
                if (intent.multiplayer && !license.multiplayer)
                {
                    reasons.Add($"License '{license.id}' does not permit multiplayer use.");
                    worst = "RED";
                }
                if (intent.redistribute && !license.redistribution)
                {
                    reasons.Add($"License '{license.id}' does not permit redistribution.");
                    worst = "RED";
                }
                if (intent.modify && !license.modification)
                {
                    reasons.Add($"License '{license.id}' does not permit modification.");
                    worst = "RED";
                }
                if (license.attribution && worst != "RED")
                {
                    reasons.Add($"License '{license.id}' requires attribution" +
                        (string.IsNullOrEmpty(license.attributionText) ? "." : $": \"{license.attributionText}\"."));
                    worst = worst == "GREEN" ? "YELLOW" : worst;
                }
            }

            return new LicenseCompatibilityResult { status = worst, reasons = reasons };
        }
    }
}
