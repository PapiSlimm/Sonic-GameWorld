using System;
using System.Collections.Generic;

// Mirrors @sonic-gameworld/world-schema (CONTRACTS.md §6). Field names and casing match
// the JSON wire format exactly (camelCase) so DTOs deserialize directly from the API
// without custom converters.
namespace SonicGameWorld.Models
{
    [Serializable]
    public sealed class Vec3
    {
        public double x;
        public double y;
        public double z;

        public Vec3() { }

        public Vec3(double x, double y, double z)
        {
            this.x = x;
            this.y = y;
            this.z = z;
        }

        public UnityEngine.Vector3 ToUnity() => new UnityEngine.Vector3((float)x, (float)y, (float)z);

        public static Vec3 FromUnity(UnityEngine.Vector3 v) => new Vec3(v.x, v.y, v.z);
    }

    [Serializable]
    public sealed class Quat
    {
        public double x;
        public double y;
        public double z;
        public double w = 1;

        public Quat() { }

        public Quat(double x, double y, double z, double w)
        {
            this.x = x;
            this.y = y;
            this.z = z;
            this.w = w;
        }

        public UnityEngine.Quaternion ToUnity() => new UnityEngine.Quaternion((float)x, (float)y, (float)z, (float)w);

        public static Quat FromUnity(UnityEngine.Quaternion q) => new Quat(q.x, q.y, q.z, q.w);
    }

    [Serializable]
    public sealed class Transform
    {
        public Vec3 position = new Vec3(0, 0, 0);
        public Quat rotation = new Quat(0, 0, 0, 1);
        public Vec3 scale = new Vec3(1, 1, 1);
    }

    /// <summary>Optional real-world anchor (WorldForge). Latitude/longitude in degrees, altitude in metres.</summary>
    [Serializable]
    public sealed class GeoAnchor
    {
        public double lat;
        public double lon;
        public double altM;
    }

    // ---- §5 marketplace taxonomy ----
    public static class ProductCategory
    {
        public const string World = "WORLD";
        public const string GameKit = "GAME_KIT";
        public const string System = "SYSTEM";
        public const string AiAgent = "AI_AGENT";
        public const string Character = "CHARACTER";
        public const string Vehicle = "VEHICLE";
        public const string Environment = "ENVIRONMENT";
        public const string Cinematic = "CINEMATIC";
        public const string Mission = "MISSION";
        public const string Experience = "EXPERIENCE";
    }

    public static class Genre
    {
        public const string Fantasy = "FANTASY";
        public const string Scifi = "SCIFI";
        public const string Horror = "HORROR";
        public const string Strategy = "STRATEGY";
        public const string Shooter = "SHOOTER";
        public const string Racing = "RACING";
        public const string Rpg = "RPG";
        public const string Mmo = "MMO";
        public const string Survival = "SURVIVAL";
        public const string Tactical = "TACTICAL";
        public const string OpenWorld = "OPEN_WORLD";
        public const string Cyberpunk = "CYBERPUNK";
        public const string Other = "OTHER";
    }

    public static class EngineTarget
    {
        public const string Web = "WEB";
        public const string Unity = "UNITY";
        public const string Unreal = "UNREAL";
        public const string Godot = "GODOT";
    }

    public static class AssetVariant
    {
        public const string Ultra = "ULTRA";
        public const string High = "HIGH";
        public const string Medium = "MEDIUM";
        public const string Low = "LOW";
        public const string Mobile = "MOBILE";
        public const string Web = "WEB";
    }

    [Serializable]
    public sealed class Page<T>
    {
        public List<T> items = new List<T>();
        public string nextCursor;
    }
}
