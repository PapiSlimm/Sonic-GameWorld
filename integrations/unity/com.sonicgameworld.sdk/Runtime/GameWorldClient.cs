using System;
using UnityEngine;

namespace SonicGameWorld
{
    /// <summary>
    /// Entry point of the Sonic GameWorld Unity SDK. Add one to your bootstrap scene
    /// (or construct it manually for editor tooling / headless code) and use its
    /// sub-clients to talk to the GameWorld platform API.
    ///
    /// <code>
    /// var client = GameWorldClient.GetOrCreate(config);
    /// StartCoroutine(client.Auth.DevLogin("me@example.com", user => { ... }, err => { ... }));
    /// StartCoroutine(client.Marketplace.Search("cyberpunk", null, results => { ... }, err => { ... }));
    /// </code>
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class GameWorldClient : MonoBehaviour
    {
        private static GameWorldClient _instance;

        [SerializeField] private GameWorldConfig config;

        public GameWorldHttp Http { get; private set; }
        public GameWorldAuth Auth { get; private set; }
        public GameWorldMarketplace Marketplace { get; private set; }
        public GameWorldWorldLoader WorldLoader { get; private set; }
        public GameWorldAI AI { get; private set; }
        public GameWorldCloud Cloud { get; private set; }
        public GameWorldLicense License { get; private set; }

        public GameWorldConfig Config => config;

        /// <summary>Finds the scene instance, or creates a persistent one from <paramref name="config"/>.</summary>
        public static GameWorldClient GetOrCreate(GameWorldConfig config = null)
        {
            if (_instance != null) return _instance;

            _instance = FindObjectOfType<GameWorldClient>();
            if (_instance != null)
            {
                if (config != null) _instance.Initialize(config);
                return _instance;
            }

            var go = new GameObject("GameWorldClient");
            _instance = go.AddComponent<GameWorldClient>();
            DontDestroyOnLoad(go);
            _instance.Initialize(config ?? GameWorldConfig.CreateDefault("https://api.sonicgameworld.com"));
            return _instance;
        }

        private void Awake()
        {
            if (_instance != null && _instance != this)
            {
                Destroy(gameObject);
                return;
            }

            _instance = this;
            if (config != null) Initialize(config);
        }

        public void Initialize(GameWorldConfig newConfig)
        {
            config = newConfig ?? throw new ArgumentNullException(nameof(newConfig));
            // Http needs a token provider before Auth exists; the lambda reads the Auth
            // property lazily (at call time), so the forward reference resolves fine
            // once Auth is assigned on the next line.
            Http = new GameWorldHttp(config, () => Auth?.GetToken());
            Auth = new GameWorldAuth(Http);
            Marketplace = new GameWorldMarketplace(Http);
            WorldLoader = new GameWorldWorldLoader(Http);
            AI = new GameWorldAI(Http);
            Cloud = new GameWorldCloud(Http);
            License = new GameWorldLicense(Http);
        }
    }
}
