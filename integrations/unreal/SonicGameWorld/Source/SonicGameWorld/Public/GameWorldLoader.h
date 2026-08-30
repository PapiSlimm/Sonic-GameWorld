// Spawns an AActor hierarchy from a GameWorld Asset Format document (CONTRACTS.md §6, §9
// "worlds") — the Unreal counterpart of the Unity SDK's GameWorldWorldLoader and TypeScript
// spatial-engine's SpatialEngine.loadWorld. One AGameWorldWorldActor is spawned as the world
// root; one AGameWorldEntityActor is spawned per FGwWorldEntity, attached according to
// `parentId` (falling back to the world root), and given a kind-appropriate placeholder visual.
//
// A future asset pipeline can replace SpawnVisual()'s placeholder primitives with a real
// runtime mesh importer (e.g. glTFRuntime) keyed off `assetRef` + CdnBaseUrl without touching
// the spawn/attach/transform logic above it.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GameWorldTypes.h"
#include "GameWorldLoader.generated.h"

class UGameWorldSubsystem;
class UStaticMeshComponent;

DECLARE_DYNAMIC_DELEGATE_OneParam(FGwOnLoaderError, const FString&, ErrorMessage);

/** Attached to every entity spawned by UGameWorldLoader. Carries the source FGwWorldEntity and,
 * for kinds that need one, a placeholder visual (mesh/light/camera/trigger volume). */
UCLASS(BlueprintType)
class SONICGAMEWORLD_API AGameWorldEntityActor : public AActor
{
	GENERATED_BODY()

public:
	AGameWorldEntityActor();

	UPROPERTY(BlueprintReadOnly, Category = "GameWorld")
	FGwWorldEntity Entity;

	/** Valid for kinds rendered as a placeholder mesh (NPC, building, room, vehicle, item, terrain, ...).
	 * Null for kinds with no default visual (REGION/ZONE/GROUP) or that use a dedicated component
	 * (LIGHT -> a ULightComponent, CAMERA -> a UCameraComponent, TRIGGER/VOLUME -> a UBoxComponent),
	 * which are added dynamically in UGameWorldLoader::SpawnVisual and reachable via GetComponentByClass. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "GameWorld")
	TObjectPtr<UStaticMeshComponent> VisualComponent;
};

/** Root actor for one loaded GameWorld world; owns every AGameWorldEntityActor spawned for it. */
UCLASS(BlueprintType)
class SONICGAMEWORLD_API AGameWorldWorldActor : public AActor
{
	GENERATED_BODY()

public:
	AGameWorldWorldActor();

	UPROPERTY(BlueprintReadOnly, Category = "GameWorld")
	FGwWorldDocument Document;

	UPROPERTY(BlueprintReadOnly, Category = "GameWorld")
	TArray<TObjectPtr<AGameWorldEntityActor>> EntityActors;

	UFUNCTION(BlueprintPure, Category = "GameWorld")
	AGameWorldEntityActor* FindEntityActor(const FString& EntityId) const;
};

DECLARE_DYNAMIC_DELEGATE_OneParam(FGwOnWorldLoaded, AGameWorldWorldActor*, WorldActor);

UCLASS(BlueprintType)
class SONICGAMEWORLD_API UGameWorldLoader : public UObject
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Loader")
	static UGameWorldLoader* Create(UObject* Outer, UGameWorldSubsystem* InSubsystem);

	/** CDN base URL used to resolve `assetRef` -> a downloadable mesh, mirroring the Unity SDK's
	 * `GameWorldWorldLoader.CdnBaseUrl`. Not yet consumed by SpawnVisual (see class comment). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld|Loader")
	FString CdnBaseUrl = TEXT("https://cdn.sonicgameworld.com/assets");

	/** `GET /v1/worlds/:id/document`, then spawns the resulting document into `WorldContextObject`'s world. */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Loader", meta = (WorldContext = "WorldContextObject"))
	void LoadWorld(UObject* WorldContextObject, const FString& WorldId, FGwOnWorldLoaded OnLoaded, FGwOnLoaderError OnError);

	/** Spawns an already-fetched document (e.g. from UGameWorldMarketplace::ImportProduct, or a
	 * locally-cached JSON file parsed with FGameWorldJson) directly, with no network round-trip. */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Loader", meta = (WorldContext = "WorldContextObject"))
	AGameWorldWorldActor* SpawnDocument(UObject* WorldContextObject, const FGwWorldDocument& Document);

	/**
	 * Converts a GameWorld transform (right-handed, Y-up, meters — CONTRACTS.md §6) into Unreal's
	 * left-handed, Z-up, centimeters space: swaps Y/Z, negates the resulting Y to preserve
	 * handedness, and scales position by 100. Rotation is remapped with the matching basis change
	 * rather than a naive per-axis swap so composed child transforms stay correct.
	 */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Loader")
	static FTransform ConvertToUnrealSpace(const FGwTransform& Source);

private:
	UPROPERTY()
	TObjectPtr<UGameWorldSubsystem> Subsystem;

	static void ApplyEnvironment(UWorld* World, const FGwWorldEnvironment& Env);
	static void SpawnVisual(AGameWorldEntityActor* Actor, const FGwWorldEntity& Entity);
};
