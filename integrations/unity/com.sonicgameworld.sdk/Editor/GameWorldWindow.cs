using System.Collections.Generic;
using SonicGameWorld.Models;
using UnityEditor;
using UnityEngine;

namespace SonicGameWorld.Editor
{
    /// <summary>
    /// Editor window: <c>Window/Sonic GameWorld/Dashboard</c>.
    ///
    /// Tabs:
    ///  - Login: dev-login by email, or paste an API key for headless/server accounts.
    ///  - Marketplace: search products, preview metadata, import a WORLD product straight into
    ///    the open scene via <see cref="GameWorldWorldLoader"/>.
    ///  - Publish: push the currently open world's document up to the server
    ///    (`PUT /v1/worlds/:id/document`) for the world tracked by <see cref="GameWorldWorldInfo"/>
    ///    in the active scene, if any.
    ///
    /// This window drives the SDK's async coroutine-shaped API using
    /// <see cref="EditorCoroutineRunner"/> since <see cref="EditorWindow"/>s cannot host
    /// <c>MonoBehaviour</c> coroutines directly.
    /// </summary>
    public sealed class GameWorldWindow : EditorWindow
    {
        private enum Tab { Login, Marketplace, Publish }

        private Tab _tab = Tab.Login;
        private string _baseUrl = "https://api.sonicgameworld.com";
        private string _email = "creator@example.com";
        private string _apiKey = "";
        private string _status = "";

        private string _searchQuery = "";
        private string _category = "";
        private List<ProductSummary> _results = new List<ProductSummary>();

        private GameWorldClient _client;

        [MenuItem("Window/Sonic GameWorld/Dashboard")]
        public static void Open()
        {
            var window = GetWindow<GameWorldWindow>();
            window.titleContent = new GUIContent("GameWorld");
            window.minSize = new Vector2(360, 420);
        }

        private void OnEnable()
        {
            _client = GameWorldClient.GetOrCreate(GameWorldConfig.CreateDefault(_baseUrl));
        }

        private void OnGUI()
        {
            _tab = (Tab)GUILayout.Toolbar((int)_tab, new[] { "Login", "Marketplace", "Publish" });
            EditorGUILayout.Space();

            switch (_tab)
            {
                case Tab.Login: DrawLogin(); break;
                case Tab.Marketplace: DrawMarketplace(); break;
                case Tab.Publish: DrawPublish(); break;
            }

            EditorGUILayout.Space();
            if (!string.IsNullOrEmpty(_status))
            {
                EditorGUILayout.HelpBox(_status, MessageType.Info);
            }
        }

        private void DrawLogin()
        {
            EditorGUILayout.LabelField("GameWorld API", EditorStyles.boldLabel);
            _baseUrl = EditorGUILayout.TextField("Base URL", _baseUrl);

            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Dev Login (non-production API only)", EditorStyles.boldLabel);
            _email = EditorGUILayout.TextField("Email", _email);
            if (GUILayout.Button("Sign in"))
            {
                _client.Initialize(GameWorldConfig.CreateDefault(_baseUrl));
                EditorCoroutineRunner.Start(_client.Auth.DevLogin(
                    _email,
                    user => _status = $"Signed in as {user.displayName} ({user.tier})",
                    err => _status = $"Login failed: {err.Message}"));
            }

            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Or authenticate with an API key", EditorStyles.boldLabel);
            _apiKey = EditorGUILayout.TextField("API Key", _apiKey);
            if (GUILayout.Button("Use API Key"))
            {
                var config = GameWorldConfig.CreateDefault(_baseUrl, _apiKey);
                _client.Initialize(config);
                _status = "API key set. Requests will authenticate with x-api-key.";
            }

            if (_client.Auth != null && _client.Auth.IsAuthenticated)
            {
                EditorGUILayout.Space();
                if (GUILayout.Button("Sign out"))
                {
                    _client.Auth.SignOut();
                    _status = "Signed out.";
                }
            }
        }

        private void DrawMarketplace()
        {
            EditorGUILayout.LabelField("Search", EditorStyles.boldLabel);
            _searchQuery = EditorGUILayout.TextField("Query", _searchQuery);
            _category = EditorGUILayout.TextField("Category (optional)", _category);

            if (GUILayout.Button("Search"))
            {
                EditorCoroutineRunner.Start(_client.Marketplace.Search(
                    _searchQuery,
                    string.IsNullOrEmpty(_category) ? null : _category,
                    result =>
                    {
                        _results = result.items;
                        _status = $"Found {result.total} product(s).";
                        Repaint();
                    },
                    err => _status = $"Search failed: {err.Message}"));
            }

            EditorGUILayout.Space();
            foreach (var product in _results)
            {
                EditorGUILayout.BeginVertical("box");
                EditorGUILayout.LabelField(product.title, EditorStyles.boldLabel);
                EditorGUILayout.LabelField($"{product.category} · ${product.priceCents / 100f:0.00} · ★{product.ratingAverage:0.0} ({product.ratingCount})");
                if (GUILayout.Button("Import into scene"))
                {
                    EditorCoroutineRunner.Start(_client.Marketplace.ImportProduct(
                        product.id,
                        doc => EditorCoroutineRunner.Start(_client.WorldLoader.Instantiate(doc, null, go =>
                        {
                            Undo.RegisterCreatedObjectUndo(go, "Import GameWorld product");
                            Selection.activeGameObject = go;
                            _status = $"Imported '{doc.name}' ({doc.entities.Count} entities).";
                        })),
                        err => _status = $"Import failed: {err.Message}"));
                }
                EditorGUILayout.EndVertical();
            }
        }

        private void DrawPublish()
        {
            EditorGUILayout.LabelField("Publish current scene's world", EditorStyles.boldLabel);
            var info = FindObjectOfType<GameWorldWorldInfo>();
            if (info == null || info.Document == null)
            {
                EditorGUILayout.HelpBox("No GameWorldWorldInfo found in the open scene. Load a world via the Marketplace tab, or the GameWorldWorldLoader API, first.", MessageType.Warning);
                return;
            }

            EditorGUILayout.LabelField("World", info.Document.name);
            EditorGUILayout.LabelField("Entities", info.Document.entities.Count.ToString());

            if (GUILayout.Button("Push document to server"))
            {
                EditorCoroutineRunner.Start(_client.WorldLoader.SaveDocument(
                    info.Document.id,
                    info.Document,
                    _ => _status = "Published.",
                    err => _status = $"Publish failed: {err.Message}"));
            }
        }
    }
}
