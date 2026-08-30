using System;
using System.Collections;
using System.Collections.Generic;
using SonicGameWorld.Models;

namespace SonicGameWorld
{
    /// <summary>
    /// Client for the GameWorld AI orchestrator (CONTRACTS.md §8, §9 "ai"). AI never mutates
    /// world state directly on the client — every command is sent to the server, validated
    /// against permissions/quotas/license compatibility, executed, and the resulting tool
    /// executions are returned for the caller to reflect locally (e.g. by re-fetching the
    /// world document, or applying the returned <see cref="ToolExecution"/> results directly
    /// to the already-loaded <see cref="GameWorldWorldLoader"/> hierarchy).
    /// </summary>
    public sealed class GameWorldAI
    {
        private readonly GameWorldHttp _http;

        internal GameWorldAI(GameWorldHttp http)
        {
            _http = http;
        }

        /// <summary>
        /// `POST /v1/ai/command` — natural-language command against a world, e.g.
        /// <c>Command("world-123", "spawn 3 enemies near building 7", "DIRECTOR", ...)</c>.
        /// </summary>
        public IEnumerator Command(
            string worldId,
            string text,
            Action<AICommandResponse> onSuccess,
            Action<GameWorldApiException> onError,
            string mode = "DIRECTOR",
            bool voice = false)
        {
            var request = new AICommandRequest { worldId = worldId, text = text, mode = mode, voice = voice };
            yield return _http.Post("/ai/command", request, onSuccess, onError);
        }

        /// <summary>`POST /v1/ai/generate` — direct content generation (e.g. `generate_asset`) outside the command pipeline.</summary>
        public IEnumerator Generate(Dictionary<string, object> request, Action<ToolExecution> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Post("/ai/generate", request, onSuccess, onError);
        }

        /// <summary>`GET /v1/ai/tools` — lists tool schemas available to the current account/tier.</summary>
        public IEnumerator ListTools(Action<List<string>> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Get("/ai/tools", onSuccess, onError);
        }

        /// <summary>`GET /v1/ai/executions` — execution history, e.g. for an in-game AI Director log panel.</summary>
        public IEnumerator ListExecutions(Action<Page<ToolExecution>> onSuccess, Action<GameWorldApiException> onError, string cursor = null)
        {
            var path = string.IsNullOrEmpty(cursor) ? "/ai/executions" : $"/ai/executions?cursor={cursor}";
            yield return _http.Get(path, onSuccess, onError);
        }

        /// <summary>`GET /v1/ai/usage` — token/tool-call usage for the current billing period.</summary>
        public IEnumerator GetUsage(Action<Dictionary<string, object>> onSuccess, Action<GameWorldApiException> onError)
        {
            yield return _http.Get("/ai/usage", onSuccess, onError);
        }
    }
}
