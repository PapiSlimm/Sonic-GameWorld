// Mirrors @sonic-gameworld/world-schema (CONTRACTS.md §6) and the Unity SDK's
// SonicGameWorld.Models namespace, so all three GameWorld client SDKs (TypeScript,
// Unity, Unreal) agree on one wire format.
//
// Fields typed `Record<string, unknown>` / `unknown` on the TypeScript side (metadata,
// behavior params, trigger params, tool-call args, condition values) are carried here as
// raw JSON strings (`FString ...Json`) rather than USTRUCTs, since Unreal has no built-in
// "arbitrary JSON value" UPROPERTY type — callers that need structured access can parse
// them with FJsonObjectConverter themselves; FGameWorldJson provides helpers for that.
#pragma once

#include "CoreMinimal.h"
#include "GameWorldTypes.generated.h"

UENUM(BlueprintType)
enum class EGwEntityKind : uint8
{
	Region,
	Zone,
	Building,
	Room,
	Npc,
	PlayerSpawn,
	Item,
	Vehicle,
	Trigger,
	Camera,
	Light,
	Prop,
	Terrain,
	Water,
	Road,
	Volume,
	Group,
};

UENUM(BlueprintType)
enum class EGwVisibility : uint8
{
	Private,
	Team,
	Public,
};

UENUM(BlueprintType)
enum class EGwWeather : uint8
{
	Clear,
	Clouds,
	Rain,
	Storm,
	Snow,
	Fog,
	Sandstorm,
};

UENUM(BlueprintType)
enum class EGwCameraMode : uint8
{
	Orbit,
	Follow,
	Chase,
	Drone,
	FirstPerson,
	ThirdPerson,
	Rail,
	Crane,
	AiDirector,
};

UENUM(BlueprintType)
enum class EGwProductCategory : uint8
{
	World,
	GameKit,
	System,
	AiAgent,
	Character,
	Vehicle,
	Environment,
	Cinematic,
	Mission,
	Experience,
};

UENUM(BlueprintType)
enum class EGwLicenseCompatibility : uint8
{
	Green,
	Yellow,
	Red,
};

/** Converts between the enums above and the exact wire-format string values used by the API. */
class SONICGAMEWORLD_API FGwEnums
{
public:
	static FString ToString(EGwEntityKind Kind);
	static EGwEntityKind EntityKindFromString(const FString& Value);

	static FString ToString(EGwVisibility Value);
	static FString ToString(EGwWeather Value);
	static EGwWeather WeatherFromString(const FString& Value);

	static FString ToString(EGwCameraMode Value);
	static EGwCameraMode CameraModeFromString(const FString& Value);

	static FString ToString(EGwProductCategory Value);
	static FString ToString(EGwLicenseCompatibility Value);
	static EGwLicenseCompatibility LicenseCompatibilityFromString(const FString& Value);
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwVec3
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	double X = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	double Y = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	double Z = 0;

	FVector ToUnrealVector() const { return FVector(X, Y, Z); }
	static FGwVec3 FromUnrealVector(const FVector& V) { return FGwVec3{V.X, V.Y, V.Z}; }
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwQuat
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	double X = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	double Y = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	double Z = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	double W = 1;

	FQuat ToUnrealQuat() const { return FQuat(X, Y, Z, W); }
	static FGwQuat FromUnrealQuat(const FQuat& Q) { return FGwQuat{Q.X, Q.Y, Q.Z, Q.W}; }
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwTransform
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FGwVec3 Position;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FGwQuat Rotation;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FGwVec3 Scale = FGwVec3{1, 1, 1};

	/** Converts to an Unreal FTransform. Note: GameWorld space is right-handed Y-up (Vec3/Quat as authored by
	 * web/Unity tooling); callers that need engine-accurate conversion should apply their own coordinate
	 * remap on top of this (e.g. swap Y/Z, negate handedness) — see GameWorldLoader::ConvertToUnrealSpace. */
	FTransform ToUnrealTransformRaw() const
	{
		return FTransform(Rotation.ToUnrealQuat(), Position.ToUnrealVector(), Scale.ToUnrealVector());
	}
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwGeoAnchor
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	double Lat = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	double Lon = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	double AltM = 0;
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwAssetRef
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString AssetId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString VersionId;

	/** ULTRA | HIGH | MEDIUM | LOW | MOBILE | WEB */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Variant;
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwEntityPermissions
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString OwnerId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	TArray<FString> Editors;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	EGwVisibility Visibility = EGwVisibility::Private;
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwEntityAI
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString AgentId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString PersonalityId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bMemoryEnabled = false;
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwWorldEntity
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Id;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	EGwEntityKind Kind = EGwEntityKind::Prop;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Name;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString ParentId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FGwTransform Transform;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bHasGeo = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FGwGeoAnchor Geo;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bHasAssetRef = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FGwAssetRef AssetRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bHasAI = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FGwEntityAI AI;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	TArray<FString> Tags;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FGwEntityPermissions Permissions;

	/** Raw JSON object for `behavior.params` (systemId lives in BehaviorSystemId). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString BehaviorSystemId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString BehaviorParamsJson;

	/** Raw JSON object for the entity's free-form `metadata`. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString MetadataJson;
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwWorldLayer
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Id;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Name;

	/** TERRAIN | BUILDINGS | ROADS | WATER | ENVIRONMENT | ENTITIES | NPCS | VEHICLES | MISSIONS |
	 *  TRIGGERS | CAMERAS | DETECTION | SENSORS | HUD | CUSTOM */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Kind;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bVisible = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bLocked = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	float Opacity = 1.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	int32 Order = 0;
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwWorldEnvironment
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	double TimeOfDay = 12;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	EGwWeather Weather = EGwWeather::Clear;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	double WeatherIntensity = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Skybox;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bHasFog = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	double FogDensity = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString FogColor;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	double Gravity = -9.81;
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwWorldBounds
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FGwVec3 Min;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FGwVec3 Max;
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwLicenseRecord
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Id;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bCommercial = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bPersonal = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bEnterprise = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bRedistribution = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bModification = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bMultiplayer = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bAiTraining = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bResale = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bSublicensing = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bAttribution = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString AttributionText;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	int32 Seats = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Spdx;
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwAssetPassport
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString AssetId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString CreatorId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString CreatedAt;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Version;

	/** ORIGINAL | IMPORTED | AI_GENERATED | AI_ASSISTED | REMIX */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Source;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FGwLicenseRecord License;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	TArray<FString> Dependencies;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bAiGenerated = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bAiAssisted = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bThirdPartyContent = false;
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwWorldDocument
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString SchemaVersion = TEXT("1.0.0");

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Id;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Name;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Description;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	TArray<FString> Genre;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	double SizeKm2 = 1;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	int32 MaxPlayers = 16;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FGwWorldBounds Bounds;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	TArray<FGwWorldLayer> Layers;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	TArray<FGwWorldEntity> Entities;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FGwWorldEnvironment Environment;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FGwAssetPassport Passport;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString CreatedAt;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString UpdatedAt;

	/** Raw JSON array for `missions` / `cameras` / `systems` / `dependencies` — parse with
	 * FGameWorldJson when a use case needs them; most world-loading code only needs entities. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString MissionsJson;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString CamerasJson;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString SystemsJson;
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwProductSummary
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Id;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Slug;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Title;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Description;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Category;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	TArray<FString> Genre;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	TArray<FString> Engines;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	int32 PriceCents = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Currency = TEXT("USD");

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString CreatorId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString CreatorHandle;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	double RatingAverage = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	int32 RatingCount = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString ThumbnailUrl;
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwMarketplaceSearchResult
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	TArray<FGwProductSummary> Items;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString NextCursor;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	int32 Total = 0;
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwAuthUser
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Id;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Email;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString DisplayName;

	/** STARTER | CREATOR | PRO | STUDIO | ENTERPRISE */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Tier;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	TArray<FString> Roles;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString OrgId;
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwToolExecution
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Id;

	/** One of AIToolName, e.g. create_entity / spawn_npc / set_weather ... (CONTRACTS.md §8) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Tool;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString ArgsJson;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bOk = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString ResultJson;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString ExecutedAt;
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwAICommandResponse
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	TArray<FGwToolExecution> Executed;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Narration;

	/** Raw JSON arrays for `plan` and `denied` tool calls. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString PlanJson;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString DeniedJson;
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwLicenseIntent
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bCommercial = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bMultiplayer = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bRedistribute = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	bool bModify = false;
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwLicenseCompatibilityResult
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	EGwLicenseCompatibility Status = EGwLicenseCompatibility::Green;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	TArray<FString> Reasons;
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwLeaderboardEntry
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString PlayerId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString DisplayName;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	double Score = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	int32 Rank = 0;
};

USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwGameSession
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Id;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString GameId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	FString Status;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld")
	TArray<FString> PlayerIds;
};
