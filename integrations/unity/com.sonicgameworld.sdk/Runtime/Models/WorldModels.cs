using System;
using System.Collections.Generic;

// Mirrors @sonic-gameworld/world-schema WorldDocument graph (CONTRACTS.md §6).
namespace SonicGameWorld.Models
{
    /// <summary>All values that may appear in <see cref="WorldEntity.kind"/>.</summary>
    public static class EntityKind
    {
        public const string Region = "REGION";
        public const string Zone = "ZONE";
        public const string Building = "BUILDING";
        public const string Room = "ROOM";
        public const string Npc = "NPC";
        public const string PlayerSpawn = "PLAYER_SPAWN";
        public const string Item = "ITEM";
        public const string Vehicle = "VEHICLE";
        public const string Trigger = "TRIGGER";
        public const string Camera = "CAMERA";
        public const string Light = "LIGHT";
        public const string Prop = "PROP";
        public const string Terrain = "TERRAIN";
        public const string Water = "WATER";
        public const string Road = "ROAD";
        public const string Volume = "VOLUME";
        public const string Group = "GROUP";

        public static readonly string[] All =
        {
            Region, Zone, Building, Room, Npc, PlayerSpawn, Item, Vehicle,
            Trigger, Camera, Light, Prop, Terrain, Water, Road, Volume, Group,
        };
    }

    public static class Visibility
    {
        public const string Private = "PRIVATE";
        public const string Team = "TEAM";
        public const string Public = "PUBLIC";
    }

    public static class Weather
    {
        public const string Clear = "CLEAR";
        public const string Clouds = "CLOUDS";
        public const string Rain = "RAIN";
        public const string Storm = "STORM";
        public const string Snow = "SNOW";
        public const string Fog = "FOG";
        public const string Sandstorm = "SANDSTORM";
    }

    public static class CameraMode
    {
        public const string Orbit = "ORBIT";
        public const string Follow = "FOLLOW";
        public const string Chase = "CHASE";
        public const string Drone = "DRONE";
        public const string FirstPerson = "FIRST_PERSON";
        public const string ThirdPerson = "THIRD_PERSON";
        public const string Rail = "RAIL";
        public const string Crane = "CRANE";
        public const string AiDirector = "AI_DIRECTOR";
    }

    [Serializable]
    public sealed class AssetRef
    {
        public string assetId;
        public string versionId;
        public string variant;
    }

    [Serializable]
    public sealed class EntityBehavior
    {
        public string systemId;
        public Dictionary<string, object> @params = new Dictionary<string, object>();
    }

    [Serializable]
    public sealed class EntityScript
    {
        /// <summary>"gwscript" or "js".</summary>
        public string language;
        public string source;
    }

    [Serializable]
    public sealed class EntityAI
    {
        public string agentId;
        public string personalityId;
        public bool memoryEnabled;
    }

    [Serializable]
    public sealed class EntityPermissions
    {
        public string ownerId;
        public List<string> editors = new List<string>();
        public string visibility = Visibility.Private;
    }

    [Serializable]
    public sealed class WorldEntity
    {
        public string id;
        public string kind;
        public string name;
        public string parentId;
        public Transform transform = new Transform();
        public GeoAnchor geo;
        public AssetRef assetRef;
        public EntityBehavior behavior;
        public EntityScript script;
        public EntityAI ai;
        public List<string> tags = new List<string>();
        public EntityPermissions permissions = new EntityPermissions();
        public Dictionary<string, object> metadata = new Dictionary<string, object>();
    }

    [Serializable]
    public sealed class WorldLayer
    {
        public string id;
        public string name;
        public string kind;
        public bool visible = true;
        public bool locked;
        public float opacity = 1f;
        public int order;
    }

    [Serializable]
    public sealed class WorldEnvironment
    {
        public double timeOfDay = 12;
        public string weather = Weather.Clear;
        public double weatherIntensity;
        public string skybox;
        public FogSettings fog;
        public double gravity = -9.81;
    }

    [Serializable]
    public sealed class FogSettings
    {
        public double density;
        public string color;
    }

    [Serializable]
    public sealed class WorldBounds
    {
        public Vec3 min = new Vec3(-500, -500, -500);
        public Vec3 max = new Vec3(500, 500, 500);
    }

    [Serializable]
    public sealed class LicenseRecord
    {
        public string id;
        public bool commercial;
        public bool personal;
        public bool enterprise;
        public bool redistribution;
        public bool modification;
        public bool multiplayer;
        public bool aiTraining;
        public bool resale;
        public bool sublicensing;
        public bool attribution;
        public string attributionText;
        public int? seats;
        public string spdx;
    }

    [Serializable]
    public sealed class WorldDependency
    {
        public string productId;
        public string versionId;
        public LicenseRecord license;
    }

    [Serializable]
    public sealed class AIProvenance
    {
        public string model;
        public string version;
        public string promptHash;
        public string creatorId;
        public string timestamp;
        public int humanModifications;
    }

    [Serializable]
    public sealed class ModificationHistoryEntry
    {
        public string at;
        public string by;
        public string note;
    }

    [Serializable]
    public sealed class MarketplaceHistoryEntry
    {
        public string productId;
        public string at;
        /// <summary>LISTED | SOLD | UPDATED | DELISTED</summary>
        public string @event;
    }

    [Serializable]
    public sealed class AssetPassport
    {
        public string assetId;
        public string creatorId;
        public string createdAt;
        public string version;
        /// <summary>ORIGINAL | IMPORTED | AI_GENERATED | AI_ASSISTED | REMIX</summary>
        public string source;
        public LicenseRecord license;
        public List<string> dependencies = new List<string>();
        public List<ModificationHistoryEntry> modificationHistory = new List<ModificationHistoryEntry>();
        public bool aiGenerated;
        public bool aiAssisted;
        public bool thirdPartyContent;
        public AIProvenance aiProvenance;
        public List<MarketplaceHistoryEntry> marketplaceHistory = new List<MarketplaceHistoryEntry>();
    }

    [Serializable]
    public sealed class SystemRef
    {
        public string id;
        public string name;
        public string kind = "CUSTOM";
        public string productId;
        public string versionId;
        public Dictionary<string, object> config = new Dictionary<string, object>();
        public bool enabled = true;
    }

    [Serializable]
    public sealed class CameraKeyframe
    {
        public double t;
        public Transform transform = new Transform();
        public double fov = 60;
    }

    [Serializable]
    public sealed class CameraRigParams
    {
        public double? distance;
        public double? height;
        public double? damping;
        public double? fov;
    }

    [Serializable]
    public sealed class CameraRig
    {
        public string id;
        public string name;
        public string mode = CameraMode.Orbit;
        public string targetEntityId;
        public List<CameraKeyframe> keyframes = new List<CameraKeyframe>();
        public CameraRigParams @params = new CameraRigParams();
    }

    [Serializable]
    public sealed class Condition
    {
        /// <summary>EQ | NE | GT | LT | HAS | NOT</summary>
        public string op;
        public string key;
        public object value;
    }

    [Serializable]
    public sealed class Objective
    {
        public string id;
        /// <summary>REACH | KILL | COLLECT | ESCORT | DEFEND | INTERACT | SURVIVE | CUSTOM</summary>
        public string type;
        public string targetEntityId;
        public int? count;
        public double? timeLimitS;
        public string description;
        public List<Condition> conditions = new List<Condition>();
    }

    [Serializable]
    public sealed class ToolCall
    {
        public string tool;
        public Dictionary<string, object> args = new Dictionary<string, object>();
    }

    [Serializable]
    public sealed class Trigger
    {
        public string id;
        /// <summary>ENTER_VOLUME | EXIT_VOLUME | TIMER | EVENT | PLAYER_COUNT | CUSTOM</summary>
        public string kind;
        public string entityId;
        public string @event;
        public Dictionary<string, object> @params = new Dictionary<string, object>();
        public List<ToolCall> actions = new List<ToolCall>();
    }

    [Serializable]
    public sealed class Reward
    {
        /// <summary>XP | CURRENCY | ITEM | UNLOCK</summary>
        public string type;
        public double? amount;
        public string itemId;
    }

    [Serializable]
    public sealed class MissionDefinition
    {
        public string id;
        public string name;
        public string description = "";
        public string chainId;
        public int order;
        public List<Objective> objectives = new List<Objective>();
        public List<Trigger> triggers = new List<Trigger>();
        public List<Reward> rewards = new List<Reward>();
        public int difficulty = 5;
        /// <summary>DRAFT | ACTIVE | COMPLETE | FAILED</summary>
        public string state = "DRAFT";
    }

    [Serializable]
    public sealed class WorldDocument
    {
        public string schemaVersion = "1.0.0";
        public string id;
        public string name;
        public string description = "";
        public List<string> genre = new List<string>();
        public double sizeKm2 = 1;
        public int maxPlayers = 16;
        public WorldBounds bounds = new WorldBounds();
        public GeoAnchor origin;
        public List<WorldLayer> layers = new List<WorldLayer>();
        public List<WorldEntity> entities = new List<WorldEntity>();
        public WorldEnvironment environment = new WorldEnvironment();
        public List<MissionDefinition> missions = new List<MissionDefinition>();
        public List<CameraRig> cameras = new List<CameraRig>();
        public List<SystemRef> systems = new List<SystemRef>();
        public List<WorldDependency> dependencies = new List<WorldDependency>();
        public AssetPassport passport;
        public string createdAt;
        public string updatedAt;
    }

    /// <summary>Summary row as returned by GET /worlds and GET /worlds/:id (without the full document).</summary>
    [Serializable]
    public sealed class WorldSummary
    {
        public string id;
        public string name;
        public string description;
        public List<string> genre = new List<string>();
        public double sizeKm2;
        public int maxPlayers;
        public string status;
        public string creatorId;
        public string orgId;
        public string createdAt;
        public string updatedAt;
    }
}
