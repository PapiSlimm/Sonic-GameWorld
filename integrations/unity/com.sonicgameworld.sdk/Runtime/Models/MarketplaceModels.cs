using System;
using System.Collections.Generic;

namespace SonicGameWorld.Models
{
    [Serializable]
    public sealed class ProductSummary
    {
        public string id;
        public string slug;
        public string title;
        public string description;
        /// <summary>WORLD | GAME_KIT | SYSTEM | AI_AGENT | CHARACTER | VEHICLE | ENVIRONMENT | CINEMATIC | MISSION | EXPERIENCE</summary>
        public string category;
        public List<string> genre = new List<string>();
        public List<string> engines = new List<string>();
        public int priceCents;
        public string currency = "USD";
        public string creatorId;
        public string creatorHandle;
        public double ratingAverage;
        public int ratingCount;
        public string thumbnailUrl;
        public string previewGlbUrl;
        public string createdAt;
        public string updatedAt;
    }

    [Serializable]
    public sealed class ProductDetail : ProductSummary
    {
        public LicenseRecord license;
        public List<string> tags = new List<string>();
        public Dictionary<string, object> metadata = new Dictionary<string, object>();
    }

    [Serializable]
    public sealed class MarketplaceSearchResult
    {
        public List<ProductSummary> items = new List<ProductSummary>();
        public string nextCursor;
        public int total;
    }

    [Serializable]
    public sealed class LicenseCompatibilityResult
    {
        /// <summary>GREEN | YELLOW | RED</summary>
        public string status;
        public List<string> reasons = new List<string>();
    }

    [Serializable]
    public sealed class OrderItem
    {
        public string productId;
        public string versionId;
        public int priceCents;
    }

    [Serializable]
    public sealed class Order
    {
        public string id;
        public string status;
        public int totalCents;
        public string currency = "USD";
        public List<OrderItem> items = new List<OrderItem>();
        public string createdAt;
    }

    [Serializable]
    public sealed class LibraryEntry
    {
        public string productId;
        public string title;
        public string licenseId;
        public string acquiredAt;
    }

    // ---- Cloud / games / sessions ----
    [Serializable]
    public sealed class GameSession
    {
        public string id;
        public string gameId;
        public string status;
        public List<string> playerIds = new List<string>();
        public string createdAt;
        public string endedAt;
    }

    [Serializable]
    public sealed class LeaderboardEntry
    {
        public string playerId;
        public string displayName;
        public double score;
        public int rank;
    }

    [Serializable]
    public sealed class CloudSaveRecord
    {
        public string gameId;
        public string playerId;
        public Dictionary<string, object> data = new Dictionary<string, object>();
        public string updatedAt;
    }

    [Serializable]
    public sealed class MatchmakeRequest
    {
        public string gameId;
        public string mode;
        public int partySize = 1;
    }

    [Serializable]
    public sealed class MatchmakeResult
    {
        public string sessionId;
        public string serverUrl;
        public string status;
    }

    // ---- AI ----
    [Serializable]
    public sealed class AICommandRequest
    {
        public string worldId;
        public string text;
        /// <summary>DIRECTOR | BUILDER | DESIGNER | NPC | QUESTMASTER | CINEMATOGRAPHER | QA | ANALYST | PUBLISHER</summary>
        public string mode;
        public bool voice;
    }

    [Serializable]
    public sealed class ToolExecution
    {
        public string id;
        public string tool;
        public Dictionary<string, object> args = new Dictionary<string, object>();
        public bool ok;
        public object result;
        public string executedAt;
    }

    [Serializable]
    public sealed class AICommandResponse
    {
        public List<ToolCall> plan = new List<ToolCall>();
        public List<ToolExecution> executed = new List<ToolExecution>();
        public List<ToolCall> denied = new List<ToolCall>();
        public string narration;
    }

    // ---- Auth ----
    [Serializable]
    public sealed class AuthTokenResponse
    {
        public string token;
        public string refreshToken;
        public AuthUser user;
    }

    [Serializable]
    public sealed class AuthUser
    {
        public string id;
        public string email;
        public string displayName;
        /// <summary>STARTER | CREATOR | PRO | STUDIO | ENTERPRISE</summary>
        public string tier;
        public List<string> roles = new List<string>();
        public string orgId;
    }

    [Serializable]
    public sealed class ApiKeyRecord
    {
        public string id;
        public string label;
        public string prefix;
        /// <summary>Only populated once, at creation time.</summary>
        public string secret;
        public string createdAt;
    }
}
