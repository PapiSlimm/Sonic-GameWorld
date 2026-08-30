using System;
using UnityEngine;

namespace SonicGameWorld
{
    /// <summary>
    /// Configuration asset for the SDK. Create one via
    /// <c>Assets/Create/Sonic GameWorld/Config</c> and assign it to a
    /// <see cref="GameWorldClient"/>, or construct a plain instance at runtime.
    /// </summary>
    [CreateAssetMenu(fileName = "GameWorldConfig", menuName = "Sonic GameWorld/Config", order = 0)]
    public sealed class GameWorldConfig : ScriptableObject
    {
        [Tooltip("GameWorld API base URL, no trailing slash and no /v1 suffix.")]
        public string BaseUrl = "https://api.sonicgameworld.com";

        [Tooltip("WebSocket base URL used by GameWorldCloud for realtime topics (wss://.../ws).")]
        public string RealtimeUrl = "wss://api.sonicgameworld.com/ws";

        [Tooltip("Server-issued API key (gw_live_... / gw_test_...) used when no user JWT is set. " +
                 "Suitable for headless/server builds; do not ship a production key inside a client build.")]
        public string ApiKey = "";

        [Tooltip("Request timeout in seconds.")]
        public int TimeoutSeconds = 30;

        public static GameWorldConfig CreateDefault(string baseUrl, string apiKey = null)
        {
            var config = CreateInstance<GameWorldConfig>();
            config.BaseUrl = baseUrl;
            config.ApiKey = apiKey ?? "";
            return config;
        }
    }
}
