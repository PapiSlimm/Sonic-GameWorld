// Hand-rolled JSON <-> USTRUCT mapping for the GameWorld wire format.
//
// We do not rely on FJsonObjectConverter::UStructToJsonObject / JsonObjectToUStruct for the
// GameWorld structs because several of them mix real UENUM fields with "raw JSON blob" FString
// fields (metadata, behavior params, tool-call args) that need to survive round-tripping
// byte-for-byte rather than being force-mapped onto a UPROPERTY. Hand-written (de)serializers
// also make the exact wire contract (matching @sonic-gameworld/world-schema) auditable in one
// place instead of depending on UHT/property-flag behavior.
#pragma once

#include "CoreMinimal.h"
#include "Dom/JsonObject.h"
#include "GameWorldTypes.h"

class SONICGAMEWORLD_API FGameWorldJson
{
public:
	// ---- generic helpers ----
	static FString ObjectToString(const TSharedPtr<FJsonObject>& Object);
	static TSharedPtr<FJsonObject> StringToObject(const FString& Json);
	static FString GetString(const TSharedPtr<FJsonObject>& Object, const FString& Field, const FString& Default = TEXT(""));
	static double GetNumber(const TSharedPtr<FJsonObject>& Object, const FString& Field, double Default = 0);
	static bool GetBool(const TSharedPtr<FJsonObject>& Object, const FString& Field, bool Default = false);
	static TArray<FString> GetStringArray(const TSharedPtr<FJsonObject>& Object, const FString& Field);

	// ---- primitives ----
	static FGwVec3 ParseVec3(const TSharedPtr<FJsonObject>& Object);
	static TSharedPtr<FJsonObject> Serialize(const FGwVec3& Value);
	static FGwQuat ParseQuat(const TSharedPtr<FJsonObject>& Object);
	static TSharedPtr<FJsonObject> Serialize(const FGwQuat& Value);
	static FGwTransform ParseTransform(const TSharedPtr<FJsonObject>& Object);
	static TSharedPtr<FJsonObject> Serialize(const FGwTransform& Value);
	static FGwGeoAnchor ParseGeoAnchor(const TSharedPtr<FJsonObject>& Object);

	// ---- entities / world ----
	static FGwAssetRef ParseAssetRef(const TSharedPtr<FJsonObject>& Object);
	static FGwEntityPermissions ParsePermissions(const TSharedPtr<FJsonObject>& Object);
	static FGwWorldEntity ParseWorldEntity(const TSharedPtr<FJsonObject>& Object);
	static TSharedPtr<FJsonObject> Serialize(const FGwWorldEntity& Entity);
	static FGwWorldLayer ParseWorldLayer(const TSharedPtr<FJsonObject>& Object);
	static FGwWorldEnvironment ParseEnvironment(const TSharedPtr<FJsonObject>& Object);
	static TSharedPtr<FJsonObject> Serialize(const FGwWorldEnvironment& Env);
	static FGwLicenseRecord ParseLicenseRecord(const TSharedPtr<FJsonObject>& Object);
	static TSharedPtr<FJsonObject> Serialize(const FGwLicenseRecord& License);
	static FGwAssetPassport ParseAssetPassport(const TSharedPtr<FJsonObject>& Object);
	static FGwWorldDocument ParseWorldDocument(const TSharedPtr<FJsonObject>& Object);
	static TSharedPtr<FJsonObject> Serialize(const FGwWorldDocument& Document);

	// ---- marketplace ----
	static FGwProductSummary ParseProductSummary(const TSharedPtr<FJsonObject>& Object);
	static FGwMarketplaceSearchResult ParseMarketplaceSearchResult(const TSharedPtr<FJsonObject>& Object);

	// ---- auth ----
	static FGwAuthUser ParseAuthUser(const TSharedPtr<FJsonObject>& Object);

	// ---- AI ----
	static FGwToolExecution ParseToolExecution(const TSharedPtr<FJsonObject>& Object);
	static FGwAICommandResponse ParseAICommandResponse(const TSharedPtr<FJsonObject>& Object);

	// ---- cloud ----
	static FGwLeaderboardEntry ParseLeaderboardEntry(const TSharedPtr<FJsonObject>& Object);
	static FGwGameSession ParseGameSession(const TSharedPtr<FJsonObject>& Object);
};
