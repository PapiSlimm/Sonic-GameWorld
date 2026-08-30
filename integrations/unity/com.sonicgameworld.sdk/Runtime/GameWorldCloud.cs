using System;
using System.Collections;
using System.Collections.Generic;
using SonicGameWorld.Models;

namespace SonicGameWorld
{
    /// <summary>
    /// GameWorld Cloud — game backend/runtime services: sessions, cloud saves, leaderboards,
    /// matchmaking and live events (CONTRACTS.md §9 "games"/"cloud"). Lets a Unity game use
    /// GameWorld as backend-as-a-service without standing up its own multiplayer/save infra.
    /// </summary>
    public sealed class GameWorldCloud
    {
        private readonly GameWorldHttp _http;

        internal GameWorldCloud(GameWorldHttp http)
        {
            _http = http;
        }

        // ---- Sessions ----

        /// <summary>`POST /v1/games/:id/sessions`</summary>
        public IEnumerator CreateSession(string gameId, Action<GameSession> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Post($"/games/{gameId}/sessions", null, onSuccess, onError);
        }

        /// <summary>`POST /v1/sessions/:id/join`</summary>
        public IEnumerator JoinSession(string sessionId, Action<GameSession> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Post($"/sessions/{sessionId}/join", null, onSuccess, onError);
        }

        /// <summary>`POST /v1/sessions/:id/end`</summary>
        public IEnumerator EndSession(string sessionId, Action<GameSession> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Post($"/sessions/{sessionId}/end", null, onSuccess, onError);
        }

        /// <summary>`GET /v1/sessions/:id`</summary>
        public IEnumerator GetSession(string sessionId, Action<GameSession> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Get($"/sessions/{sessionId}", onSuccess, onError);
        }

        // ---- Cloud saves ----

        /// <summary>`GET /v1/games/:id/saves/:playerId`</summary>
        public IEnumerator GetSave(string gameId, string playerId, Action<CloudSaveRecord> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Get($"/games/{gameId}/saves/{playerId}", onSuccess, onError);
        }

        /// <summary>`PUT /v1/games/:id/saves/:playerId`</summary>
        public IEnumerator PutSave(string gameId, string playerId, Dictionary<string, object> data, Action<CloudSaveRecord> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Put($"/games/{gameId}/saves/{playerId}", new { data }, onSuccess, onError);
        }

        // ---- Leaderboards ----

        /// <summary>`GET /v1/games/:id/leaderboard`</summary>
        public IEnumerator GetLeaderboard(string gameId, Action<List<LeaderboardEntry>> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Get($"/games/{gameId}/leaderboard", onSuccess, onError);
        }

        /// <summary>`POST /v1/games/:id/leaderboard` — submits a score for the current player.</summary>
        public IEnumerator SubmitScore(string gameId, double score, Action<LeaderboardEntry> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Post($"/games/{gameId}/leaderboard", new { score }, onSuccess, onError);
        }

        // ---- Matchmaking & live events ----

        /// <summary>`POST /v1/cloud/matchmake`</summary>
        public IEnumerator Matchmake(MatchmakeRequest request, Action<MatchmakeResult> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Post("/cloud/matchmake", request, onSuccess, onError);
        }

        /// <summary>`GET /v1/cloud/servers`</summary>
        public IEnumerator GetServers(Action<List<Dictionary<string, object>>> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Get("/cloud/servers", onSuccess, onError);
        }

        /// <summary>`GET /v1/cloud/live-events`</summary>
        public IEnumerator GetLiveEvents(Action<List<Dictionary<string, object>>> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Get("/cloud/live-events", onSuccess, onError);
        }

        /// <summary>`POST /v1/cloud/live-events`</summary>
        public IEnumerator CreateLiveEvent(Dictionary<string, object> payload, Action<Dictionary<string, object>> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Post("/cloud/live-events", payload, onSuccess, onError);
        }

        // ---- Analytics ----

        /// <summary>`POST /v1/analytics/events` — fire-and-forget gameplay telemetry.</summary>
        public IEnumerator TrackEvent(string type, Dictionary<string, object> payload, Action onSuccess = null, Action<GameWorldApiException> onError = null)
        {
            yield return _http.Post<GameWorldVoid>("/analytics/events", new { type, payload }, _ => onSuccess?.Invoke(), onError);
        }
    }
}
