using System;
using System.Collections;
using SonicGameWorld.Models;
using UnityEngine;

namespace SonicGameWorld
{
    /// <summary>
    /// Handles login and JWT/API-key credential storage for the SDK.
    ///
    /// Three auth paths, matching CONTRACTS.md §3:
    ///  - <see cref="DevLogin"/>: `POST /v1/auth/dev` — email only, non-production only.
    ///  - <see cref="LoginWithFirebaseIdToken"/>: `POST /v1/auth/firebase` — exchanges a Firebase
    ///    ID token (from Firebase Auth Unity SDK) for a GameWorld JWT.
    ///  - API key: set <see cref="GameWorldConfig.ApiKey"/> and skip login entirely — used by
    ///    dedicated/headless server builds (`x-api-key: gw_live_...`).
    ///
    /// The current JWT is cached in memory and persisted to <see cref="PlayerPrefs"/>
    /// (key <c>GameWorld.Jwt</c>) so a returning player does not need to log in again.
    /// </summary>
    public sealed class GameWorldAuth
    {
        private const string PrefsKey = "GameWorld.Jwt";
        private const string PrefsRefreshKey = "GameWorld.RefreshToken";

        private readonly GameWorldHttp _http;
        private string _token;
        private string _refreshToken;

        public AuthUser CurrentUser { get; private set; }
        public bool IsAuthenticated => !string.IsNullOrEmpty(_token);

        internal GameWorldAuth(GameWorldHttp http)
        {
            _http = http;
            _token = PlayerPrefs.GetString(PrefsKey, null);
            _refreshToken = PlayerPrefs.GetString(PrefsRefreshKey, null);
        }

        /// <summary>Used by <see cref="GameWorldHttp"/> as the bearer token provider.</summary>
        internal string GetToken() => _token;

        private void Store(AuthTokenResponse response)
        {
            _token = response.token;
            _refreshToken = response.refreshToken;
            CurrentUser = response.user;
            PlayerPrefs.SetString(PrefsKey, _token ?? string.Empty);
            PlayerPrefs.SetString(PrefsRefreshKey, _refreshToken ?? string.Empty);
            PlayerPrefs.Save();
        }

        public void SignOut()
        {
            _token = null;
            _refreshToken = null;
            CurrentUser = null;
            PlayerPrefs.DeleteKey(PrefsKey);
            PlayerPrefs.DeleteKey(PrefsRefreshKey);
        }

        /// <summary>Development login: `POST /v1/auth/dev` — only works when the API is not running with NODE_ENV=production.</summary>
        public IEnumerator DevLogin(string email, Action<AuthUser> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Post<AuthTokenResponse>("/auth/dev", new { email }, response =>
            {
                Store(response);
                onSuccess?.Invoke(response.user);
            }, onError);
        }

        /// <summary>Exchanges a Firebase ID token for a GameWorld JWT via `POST /v1/auth/firebase`.</summary>
        public IEnumerator LoginWithFirebaseIdToken(string firebaseIdToken, Action<AuthUser> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Post<AuthTokenResponse>("/auth/firebase", new { idToken = firebaseIdToken }, response =>
            {
                Store(response);
                onSuccess?.Invoke(response.user);
            }, onError);
        }

        /// <summary>Refreshes the current session via `POST /v1/auth/refresh`.</summary>
        public IEnumerator Refresh(Action<AuthUser> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Post<AuthTokenResponse>("/auth/refresh", new { refreshToken = _refreshToken }, response =>
            {
                Store(response);
                onSuccess?.Invoke(response.user);
            }, onError);
        }

        /// <summary>`GET /v1/auth/me` — refreshes <see cref="CurrentUser"/> from the server.</summary>
        public IEnumerator FetchMe(Action<AuthUser> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Get<AuthUser>("/auth/me", user =>
            {
                CurrentUser = user;
                onSuccess?.Invoke(user);
            }, onError);
        }

        /// <summary>`POST /v1/auth/api-keys` — mints a new API key for the current account (owner/admin only).</summary>
        public IEnumerator CreateApiKey(string label, Action<ApiKeyRecord> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Post("/auth/api-keys", new { label }, onSuccess, onError);
        }

        /// <summary>`DELETE /v1/auth/api-keys/:id`.</summary>
        public IEnumerator RevokeApiKey(string id, Action onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Delete<GameWorldVoid>($"/auth/api-keys/{id}", _ => onSuccess?.Invoke(), onError);
        }
    }
}
