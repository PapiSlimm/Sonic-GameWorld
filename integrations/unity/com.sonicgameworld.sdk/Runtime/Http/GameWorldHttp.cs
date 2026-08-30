using System;
using System.Collections;
using System.Text;
using Newtonsoft.Json;
using UnityEngine;
using UnityEngine.Networking;

namespace SonicGameWorld
{
    /// <summary>
    /// Raised when the GameWorld API returns a non-2xx response. Mirrors the
    /// <c>ApiError</c> shape thrown by the TypeScript `@sonic-gameworld/gameworld-sdk`
    /// so error handling logic can be ported 1:1 between engines.
    /// </summary>
    public sealed class GameWorldApiException : Exception
    {
        public long StatusCode { get; }
        public string ErrorCode { get; }
        public object Details { get; }

        public GameWorldApiException(long statusCode, string code, string message, object details = null)
            : base(message)
        {
            StatusCode = statusCode;
            ErrorCode = code;
            Details = details;
        }

        public override string ToString() => $"GameWorldApiException[{StatusCode} {ErrorCode}]: {Message}";
    }

    [Serializable]
    internal sealed class ApiErrorEnvelope
    {
        public ApiErrorBody error;
    }

    [Serializable]
    internal sealed class ApiErrorBody
    {
        public string code;
        public string message;
        public object details;
    }

    /// <summary>
    /// Thin REST transport over <see cref="UnityWebRequest"/>. Every call in the SDK
    /// (auth, marketplace, worlds, AI, cloud) routes through this class so that
    /// authentication headers, base-URL resolution, JSON (de)serialization and error
    /// handling live in exactly one place.
    ///
    /// The GameWorld API surface lives under `/v1` (see CONTRACTS.md §9); callers pass
    /// paths without that prefix, e.g. <c>Get&lt;WorldDto&gt;("/worlds/123")</c>.
    /// </summary>
    public class GameWorldHttp
    {
        private readonly GameWorldConfig _config;
        private readonly Func<string> _tokenProvider;

        public GameWorldHttp(GameWorldConfig config, Func<string> tokenProvider)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _tokenProvider = tokenProvider;
        }

        private string BuildUrl(string path)
        {
            var baseUrl = _config.BaseUrl.TrimEnd('/');
            var suffix = path.StartsWith("/") ? path : "/" + path;
            return $"{baseUrl}/v1{suffix}";
        }

        public IEnumerator Get<T>(string path, Action<T> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return Send<T>(UnityWebRequest.kHttpVerbGET, path, null, onSuccess, onError);
        }

        public IEnumerator Post<T>(string path, object body, Action<T> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return Send<T>(UnityWebRequest.kHttpVerbPOST, path, body, onSuccess, onError);
        }

        public IEnumerator Put<T>(string path, object body, Action<T> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return Send<T>(UnityWebRequest.kHttpVerbPUT, path, body, onSuccess, onError);
        }

        public IEnumerator Patch<T>(string path, object body, Action<T> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return Send<T>("PATCH", path, body, onSuccess, onError);
        }

        public IEnumerator Delete<T>(string path, Action<T> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return Send<T>(UnityWebRequest.kHttpVerbDELETE, path, null, onSuccess, onError);
        }

        private IEnumerator Send<T>(string method, string path, object body, Action<T> onSuccess, Action<GameWorldApiException> onError)
        {
            var url = BuildUrl(path);
            using var request = new UnityWebRequest(url, method);
            request.downloadHandler = new DownloadHandlerBuffer();

            if (body != null)
            {
                var json = JsonConvert.SerializeObject(body, GameWorldJson.Settings);
                var raw = Encoding.UTF8.GetBytes(json);
                request.uploadHandler = new UploadHandlerRaw(raw);
                request.SetRequestHeader("Content-Type", "application/json");
            }

            request.SetRequestHeader("Accept", "application/json");
            request.SetRequestHeader("X-GameWorld-SDK", "unity/1.0.0");

            var token = _tokenProvider?.Invoke();
            if (!string.IsNullOrEmpty(token))
            {
                request.SetRequestHeader("Authorization", $"Bearer {token}");
            }
            else if (!string.IsNullOrEmpty(_config.ApiKey))
            {
                request.SetRequestHeader("x-api-key", _config.ApiKey);
            }

            request.timeout = _config.TimeoutSeconds;

            yield return request.SendWebRequest();

            if (request.result == UnityWebRequest.Result.ConnectionError ||
                request.result == UnityWebRequest.Result.DataProcessingError)
            {
                onError?.Invoke(new GameWorldApiException(0, "NETWORK_ERROR", request.error));
                yield break;
            }

            var text = request.downloadHandler?.text;
            var status = request.responseCode;

            if (status < 200 || status >= 300)
            {
                string code = "UNKNOWN_ERROR";
                string message = $"GameWorld API request failed with status {status}";
                object details = null;
                if (!string.IsNullOrEmpty(text))
                {
                    try
                    {
                        var envelope = JsonConvert.DeserializeObject<ApiErrorEnvelope>(text);
                        if (envelope?.error != null)
                        {
                            code = envelope.error.code ?? code;
                            message = envelope.error.message ?? message;
                            details = envelope.error.details;
                        }
                    }
                    catch (JsonException)
                    {
                        message = text;
                    }
                }

                onError?.Invoke(new GameWorldApiException(status, code, message, details));
                yield break;
            }

            if (typeof(T) == typeof(GameWorldVoid))
            {
                onSuccess?.Invoke(default);
                yield break;
            }

            try
            {
                var result = string.IsNullOrEmpty(text)
                    ? default
                    : JsonConvert.DeserializeObject<T>(text, GameWorldJson.Settings);
                onSuccess?.Invoke(result);
            }
            catch (JsonException ex)
            {
                onError?.Invoke(new GameWorldApiException(status, "PARSE_ERROR", ex.Message));
            }
        }
    }

    /// <summary>Marker type used for endpoints that return no body (204 / empty 200).</summary>
    public struct GameWorldVoid
    {
    }

    internal static class GameWorldJson
    {
        public static readonly JsonSerializerSettings Settings = new JsonSerializerSettings
        {
            NullValueHandling = NullValueHandling.Ignore,
            MissingMemberHandling = MissingMemberHandling.Ignore,
        };
    }
}
