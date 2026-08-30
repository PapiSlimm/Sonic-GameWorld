using System;
using System.Collections;
using System.Collections.Generic;
using SonicGameWorld.Models;
using UnityEngine;

namespace SonicGameWorld
{
    /// <summary>
    /// Loads a GameWorld Asset Format <see cref="WorldDocument"/> (fetched from the API, imported
    /// from the marketplace, or loaded from a local JSON file) into a Unity scene as a hierarchy of
    /// <see cref="GameObject"/>s — one per <see cref="WorldEntity"/>, parented according to
    /// <see cref="WorldEntity.parentId"/> and positioned/rotated/scaled from its <see cref="Transform"/>.
    ///
    /// When an entity carries an <see cref="AssetRef"/> and glTFast
    /// (`com.unity.cloud.gltfast`) is present in the project, the referenced GLB is streamed from
    /// the asset CDN and instantiated as a child of the entity's GameObject. Without glTFast, a
    /// kind-appropriate primitive placeholder is used instead so worlds still load and are visibly
    /// correct in editors that have not installed the optional dependency.
    /// </summary>
    public sealed class GameWorldWorldLoader
    {
        private readonly GameWorldHttp _http;

        /// <summary>CDN base URL used to resolve `assetRef` → GLB download URL. Defaults to the API's asset CDN.</summary>
        public string CdnBaseUrl { get; set; } = "https://cdn.sonicgameworld.com/assets";

        internal GameWorldWorldLoader(GameWorldHttp http)
        {
            _http = http;
        }

        /// <summary>`GET /v1/worlds/:id/document`</summary>
        public IEnumerator FetchDocument(string worldId, Action<WorldDocument> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Get($"/worlds/{worldId}/document", onSuccess, onError);
        }

        /// <summary>`PUT /v1/worlds/:id/document` — pushes local edits back to the server.</summary>
        public IEnumerator SaveDocument(string worldId, WorldDocument document, Action<WorldDocument> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Put($"/worlds/{worldId}/document", document, onSuccess, onError);
        }

        /// <summary>Fetches and instantiates a world in one call.</summary>
        public IEnumerator LoadWorld(string worldId, Transform parent, Action<GameObject, WorldDocument> onLoaded, Action<GameWorldApiException> onError)
        {
            WorldDocument doc = null;
            GameWorldApiException failure = null;
            yield return FetchDocument(worldId, d => doc = d, e => failure = e);

            if (failure != null) { onError?.Invoke(failure); yield break; }

            GameObject root = null;
            yield return Instantiate(doc, parent, go => root = go);
            onLoaded?.Invoke(root, doc);
        }

        /// <summary>
        /// Builds the GameObject hierarchy for an already-fetched <see cref="WorldDocument"/> (e.g. one
        /// loaded from a local file for offline preview, or produced by <c>GameWorldMarketplace.ImportProduct</c>).
        /// </summary>
        public IEnumerator Instantiate(WorldDocument document, Transform parent, Action<GameObject> onComplete)
        {
            if (document == null) throw new ArgumentNullException(nameof(document));

            var root = new GameObject($"World_{document.name}");
            if (parent != null) root.transform.SetParent(parent, false);

            var worldInfo = root.AddComponent<GameWorldWorldInfo>();
            worldInfo.Document = document;

            ApplyEnvironment(document.environment);

            var byId = new Dictionary<string, GameObject>();

            // First pass: create every GameObject (unparented) so parent lookups always resolve
            // regardless of array order.
            foreach (var entity in document.entities)
            {
                var go = new GameObject(string.IsNullOrEmpty(entity.name) ? entity.id : entity.name);
                var marker = go.AddComponent<GameWorldEntity>();
                marker.Entity = entity;
                ApplyTransform(go.transform, entity.transform);
                byId[entity.id] = go;
            }

            // Second pass: parent according to parentId, falling back to world root.
            foreach (var entity in document.entities)
            {
                var go = byId[entity.id];
                Transform parentTransform = root.transform;
                if (!string.IsNullOrEmpty(entity.parentId) && byId.TryGetValue(entity.parentId, out var parentGo))
                {
                    parentTransform = parentGo.transform;
                }
                go.transform.SetParent(parentTransform, true);
            }

            // Third pass: build visuals (primitive placeholder, or GLB via glTFast when available).
            foreach (var entity in document.entities)
            {
                yield return BuildVisual(byId[entity.id], entity);
            }

            onComplete?.Invoke(root);
        }

        private static void ApplyTransform(Transform t, Models.Transform src)
        {
            if (src == null) return;
            t.localPosition = src.position?.ToUnity() ?? Vector3.zero;
            t.localRotation = src.rotation?.ToUnity() ?? Quaternion.identity;
            t.localScale = src.scale?.ToUnity() ?? Vector3.one;
        }

        private static void ApplyEnvironment(WorldEnvironment env)
        {
            if (env == null) return;
            RenderSettings.fog = env.fog != null && env.fog.density > 0;
            if (env.fog != null)
            {
                RenderSettings.fogDensity = (float)env.fog.density;
                if (ColorUtility.TryParseHtmlString(env.fog.color, out var c)) RenderSettings.fogColor = c;
            }
            Physics.gravity = new Vector3(0, (float)env.gravity, 0);
        }

        private IEnumerator BuildVisual(GameObject go, WorldEntity entity)
        {
            if (entity.assetRef != null && !string.IsNullOrEmpty(entity.assetRef.assetId))
            {
#if GAMEWORLD_GLTFAST
                yield return LoadGlbWithGltfast(go, entity.assetRef);
                yield break;
#else
                Debug.LogWarning(
                    $"[GameWorld] Entity '{entity.name}' references asset '{entity.assetRef.assetId}' but " +
                    "com.unity.cloud.gltfast is not installed — using a placeholder primitive instead. " +
                    "Install glTFast to render real GLB assets.");
#endif
            }

            BuildPlaceholder(go, entity.kind);
            yield break;
        }

#if GAMEWORLD_GLTFAST
        private IEnumerator LoadGlbWithGltfast(GameObject go, AssetRef assetRef)
        {
            var url = $"{CdnBaseUrl.TrimEnd('/')}/{assetRef.assetId}" +
                      (string.IsNullOrEmpty(assetRef.variant) ? "" : $"/{assetRef.variant}") + ".glb";

            var gltf = new GLTFast.GltfImport();
            var loadTask = gltf.Load(url);
            while (!loadTask.IsCompleted) yield return null;

            if (!loadTask.Result)
            {
                Debug.LogWarning($"[GameWorld] Failed to load GLB from {url}, falling back to placeholder.");
                BuildPlaceholder(go, EntityKind.Prop);
                yield break;
            }

            var instantiateTask = gltf.InstantiateMainSceneAsync(go.transform);
            while (!instantiateTask.IsCompleted) yield return null;
        }
#endif

        /// <summary>Kind-appropriate primitive stand-in used whenever a real mesh is unavailable.</summary>
        private static void BuildPlaceholder(GameObject go, string kind)
        {
            PrimitiveType primitive;
            Vector3 localScale = Vector3.one;
            Color color;

            switch (kind)
            {
                case EntityKind.Npc:
                    primitive = PrimitiveType.Capsule; color = new Color(0.22f, 0.96f, 0.78f); break;
                case EntityKind.PlayerSpawn:
                    primitive = PrimitiveType.Cylinder; localScale = new Vector3(1f, 0.05f, 1f); color = new Color(0.49f, 0.36f, 1f); break;
                case EntityKind.Vehicle:
                    primitive = PrimitiveType.Cube; localScale = new Vector3(2f, 1f, 4f); color = new Color(1f, 0.69f, 0.13f); break;
                case EntityKind.Building:
                    primitive = PrimitiveType.Cube; localScale = new Vector3(6f, 8f, 6f); color = new Color(0.4f, 0.4f, 0.45f); break;
                case EntityKind.Room:
                    primitive = PrimitiveType.Cube; localScale = new Vector3(4f, 3f, 4f); color = new Color(0.6f, 0.6f, 0.65f); break;
                case EntityKind.Terrain:
                case EntityKind.Water:
                case EntityKind.Road:
                    primitive = PrimitiveType.Plane; color = kind == EntityKind.Water ? new Color(0.1f, 0.4f, 0.9f, 0.6f) : new Color(0.3f, 0.3f, 0.3f); break;
                case EntityKind.Light:
                    var lightGo = go.AddComponent<Light>();
                    lightGo.type = LightType.Point;
                    lightGo.color = new Color(1f, 0.69f, 0.13f);
                    return;
                case EntityKind.Camera:
                    go.AddComponent<Camera>();
                    return;
                case EntityKind.Trigger:
                case EntityKind.Volume:
                    var box = go.AddComponent<BoxCollider>();
                    box.isTrigger = true;
                    return;
                case EntityKind.Item:
                    primitive = PrimitiveType.Sphere; localScale = Vector3.one * 0.5f; color = new Color(1f, 0.3f, 0.42f); break;
                case EntityKind.Region:
                case EntityKind.Zone:
                case EntityKind.Group:
                    // Purely organizational — no visual.
                    return;
                default:
                    primitive = PrimitiveType.Cube; color = Color.gray; break;
            }

            var visual = GameObject.CreatePrimitive(primitive);
            visual.name = "Visual";
            visual.transform.SetParent(go.transform, false);
            visual.transform.localScale = localScale;

            var renderer = visual.GetComponent<Renderer>();
            if (renderer != null)
            {
                var mat = new Material(Shader.Find("Standard")) { color = color };
                renderer.sharedMaterial = mat;
            }

            // Placeholder colliders shouldn't block gameplay by default.
            var collider = visual.GetComponent<Collider>();
            if (collider != null) collider.enabled = false;
        }
    }

    /// <summary>Attached to the root GameObject created by <see cref="GameWorldWorldLoader"/>; carries the source document.</summary>
    public sealed class GameWorldWorldInfo : MonoBehaviour
    {
        public WorldDocument Document;
    }

    /// <summary>Attached to every entity GameObject created by <see cref="GameWorldWorldLoader"/>; carries the source entity.</summary>
    public sealed class GameWorldEntity : MonoBehaviour
    {
        public WorldEntity Entity;
    }
}
