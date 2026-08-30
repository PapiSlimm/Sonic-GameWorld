#include "GameWorldLoader.h"
#include "GameWorldSubsystem.h"
#include "GameWorldJson.h"
#include "Components/StaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/BoxComponent.h"
#include "Camera/CameraComponent.h"
#include "Engine/Engine.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/WorldSettings.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Kismet/GameplayStatics.h"

// ---------------------------------------------------------------------------
// AGameWorldEntityActor / AGameWorldWorldActor
// ---------------------------------------------------------------------------

AGameWorldEntityActor::AGameWorldEntityActor()
{
	PrimaryActorTick.bCanEverTick = false;

	USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);

	VisualComponent = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Visual"));
	VisualComponent->SetupAttachment(Root);
	VisualComponent->SetVisibility(false);
	VisualComponent->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

AGameWorldWorldActor::AGameWorldWorldActor()
{
	PrimaryActorTick.bCanEverTick = false;
	SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Root")));
}

AGameWorldEntityActor* AGameWorldWorldActor::FindEntityActor(const FString& EntityId) const
{
	for (const TObjectPtr<AGameWorldEntityActor>& Actor : EntityActors)
	{
		if (Actor && Actor->Entity.Id == EntityId) return Actor;
	}
	return nullptr;
}

// ---------------------------------------------------------------------------
// UGameWorldLoader
// ---------------------------------------------------------------------------

UGameWorldLoader* UGameWorldLoader::Create(UObject* Outer, UGameWorldSubsystem* InSubsystem)
{
	UGameWorldLoader* Instance = NewObject<UGameWorldLoader>(Outer ? Outer : GetTransientPackage());
	Instance->Subsystem = InSubsystem;
	return Instance;
}

void UGameWorldLoader::LoadWorld(UObject* WorldContextObject, const FString& WorldId, FGwOnWorldLoaded OnLoaded, FGwOnLoaderError OnError)
{
	if (!Subsystem) { OnError.ExecuteIfBound(TEXT("GameWorld subsystem not set.")); return; }

	TWeakObjectPtr<UObject> WeakContext(WorldContextObject);
	TWeakObjectPtr<UGameWorldLoader> WeakSelf(this);

	Subsystem->SendJsonRequest(TEXT("GET"), FString::Printf(TEXT("/worlds/%s/document"), *WorldId), nullptr,
		[WeakSelf, WeakContext, OnLoaded, OnError](TSharedPtr<FJsonObject> Response)
		{
			if (!WeakSelf.IsValid() || !WeakContext.IsValid())
			{
				OnError.ExecuteIfBound(TEXT("GameWorld loader or world context destroyed before the response arrived."));
				return;
			}
			const FGwWorldDocument Document = FGameWorldJson::ParseWorldDocument(Response);
			AGameWorldWorldActor* WorldActor = WeakSelf->SpawnDocument(WeakContext.Get(), Document);
			OnLoaded.ExecuteIfBound(WorldActor);
		},
		[OnError](const FGwApiError& Error) { OnError.ExecuteIfBound(Error.Message); });
}

FTransform UGameWorldLoader::ConvertToUnrealSpace(const FGwTransform& Source)
{
	// GameWorld: right-handed, Y-up, meters. Unreal: left-handed, Z-up, centimeters.
	// Position: (x, y, z)_gw -> (x, z, y)_ue, scaled meters->centimeters. Swapping exactly one
	// axis pair flips handedness, matching Unreal's left-handed convention.
	const FVector Position(
		static_cast<float>(Source.Position.X) * 100.f,
		static_cast<float>(Source.Position.Z) * 100.f,
		static_cast<float>(Source.Position.Y) * 100.f);

	// Rotation: conjugate the same axis swap into the quaternion (swap Y/Z, negate the swapped-in
	// Y to keep the handedness flip consistent with the position remap above) rather than
	// reinterpreting components directly, so composed rotations remain valid unit quaternions.
	const FQuat GwQuat(Source.Rotation.X, Source.Rotation.Z, -Source.Rotation.Y, Source.Rotation.W);

	const FVector Scale(
		static_cast<float>(Source.Scale.X),
		static_cast<float>(Source.Scale.Z),
		static_cast<float>(Source.Scale.Y));

	return FTransform(GwQuat.GetNormalized(), Position, Scale);
}

void UGameWorldLoader::ApplyEnvironment(UWorld* World, const FGwWorldEnvironment& Env)
{
	if (!World) return;
	// Gravity is authored in m/s^2 (negative = down); Unreal's global gravity Z is in cm/s^2.
	if (AWorldSettings* Settings = World->GetWorldSettings())
	{
		Settings->GlobalGravityZ = static_cast<float>(Env.Gravity) * 100.f;
		Settings->bGlobalGravitySet = true;
	}
}

AGameWorldWorldActor* UGameWorldLoader::SpawnDocument(UObject* WorldContextObject, const FGwWorldDocument& Document)
{
	UWorld* World = WorldContextObject ? GEngine->GetWorldFromContextObject(WorldContextObject, EGetWorldErrorMode::LogAndReturnNull) : nullptr;
	if (!World) return nullptr;

	FActorSpawnParameters SpawnParams;
	SpawnParams.Name = MakeUniqueObjectName(World, AGameWorldWorldActor::StaticClass(), FName(*FString::Printf(TEXT("GameWorld_%s"), *Document.Id)));
	AGameWorldWorldActor* WorldActor = World->SpawnActor<AGameWorldWorldActor>(SpawnParams);
	if (!WorldActor) return nullptr;

	WorldActor->Document = Document;
#if WITH_EDITOR
	WorldActor->SetActorLabel(Document.Name.IsEmpty() ? Document.Id : Document.Name);
#endif

	ApplyEnvironment(World, Document.Environment);

	TMap<FString, AGameWorldEntityActor*> ById;

	// First pass: spawn every entity actor (attached to the world root for now) so parent
	// lookups always resolve regardless of array order.
	for (const FGwWorldEntity& Entity : Document.Entities)
	{
		FActorSpawnParameters EntitySpawnParams;
		EntitySpawnParams.Owner = WorldActor;
		AGameWorldEntityActor* EntityActor = World->SpawnActor<AGameWorldEntityActor>(EntitySpawnParams);
		if (!EntityActor) continue;

		EntityActor->Entity = Entity;
		EntityActor->AttachToActor(WorldActor, FAttachmentTransformRules::KeepRelativeTransform);
		EntityActor->SetActorRelativeTransform(ConvertToUnrealSpace(Entity.Transform));
#if WITH_EDITOR
		EntityActor->SetActorLabel(Entity.Name.IsEmpty() ? Entity.Id : Entity.Name);
#endif

		WorldActor->EntityActors.Add(EntityActor);
		ById.Add(Entity.Id, EntityActor);
	}

	// Second pass: re-parent according to `parentId`, preserving each entity's authored local
	// transform relative to its real parent.
	for (const TObjectPtr<AGameWorldEntityActor>& EntityActor : WorldActor->EntityActors)
	{
		if (EntityActor->Entity.ParentId.IsEmpty()) continue;
		if (AGameWorldEntityActor** Parent = ById.Find(EntityActor->Entity.ParentId))
		{
			EntityActor->AttachToActor(*Parent, FAttachmentTransformRules::KeepRelativeTransform);
		}
	}

	// Third pass: build placeholder visuals now that the hierarchy (and therefore world-space
	// transforms) is final.
	for (const TObjectPtr<AGameWorldEntityActor>& EntityActor : WorldActor->EntityActors)
	{
		SpawnVisual(EntityActor, EntityActor->Entity);
	}

	return WorldActor;
}

namespace
{
	UStaticMesh* LoadEngineShape(const TCHAR* AssetPath)
	{
		return LoadObject<UStaticMesh>(nullptr, AssetPath);
	}

	void ApplyPlaceholderMesh(AGameWorldEntityActor* Actor, const TCHAR* ShapeAssetPath, const FVector& Scale, const FLinearColor& Color)
	{
		UStaticMesh* Mesh = LoadEngineShape(ShapeAssetPath);
		if (!Mesh || !Actor->VisualComponent) return;

		Actor->VisualComponent->SetStaticMesh(Mesh);
		Actor->VisualComponent->SetRelativeScale3D(Scale);
		Actor->VisualComponent->SetVisibility(true);
		Actor->VisualComponent->SetCollisionEnabled(ECollisionEnabled::NoCollision);

		if (UMaterialInterface* BaseMaterial = Actor->VisualComponent->GetMaterial(0))
		{
			UMaterialInstanceDynamic* Dynamic = UMaterialInstanceDynamic::Create(BaseMaterial, Actor);
			// No-ops silently on materials without a matching parameter (e.g. the engine default),
			// so this is safe regardless of which base material the basic shape ships with.
			Dynamic->SetVectorParameterValue(TEXT("Color"), Color);
			Actor->VisualComponent->SetMaterial(0, Dynamic);
		}
	}
}

void UGameWorldLoader::SpawnVisual(AGameWorldEntityActor* Actor, const FGwWorldEntity& Entity)
{
	if (!Actor) return;

	switch (Entity.Kind)
	{
	case EGwEntityKind::Npc:
		ApplyPlaceholderMesh(Actor, TEXT("/Engine/BasicShapes/Cylinder.Cylinder"), FVector(0.5f, 0.5f, 1.f), FLinearColor(0.22f, 0.96f, 0.78f));
		break;
	case EGwEntityKind::PlayerSpawn:
		ApplyPlaceholderMesh(Actor, TEXT("/Engine/BasicShapes/Cylinder.Cylinder"), FVector(1.f, 1.f, 0.05f), FLinearColor(0.49f, 0.36f, 1.f));
		break;
	case EGwEntityKind::Vehicle:
		ApplyPlaceholderMesh(Actor, TEXT("/Engine/BasicShapes/Cube.Cube"), FVector(2.f, 4.f, 1.f), FLinearColor(1.f, 0.69f, 0.13f));
		break;
	case EGwEntityKind::Building:
		ApplyPlaceholderMesh(Actor, TEXT("/Engine/BasicShapes/Cube.Cube"), FVector(6.f, 6.f, 8.f), FLinearColor(0.4f, 0.4f, 0.45f));
		break;
	case EGwEntityKind::Room:
		ApplyPlaceholderMesh(Actor, TEXT("/Engine/BasicShapes/Cube.Cube"), FVector(4.f, 4.f, 3.f), FLinearColor(0.6f, 0.6f, 0.65f));
		break;
	case EGwEntityKind::Terrain:
	case EGwEntityKind::Road:
		ApplyPlaceholderMesh(Actor, TEXT("/Engine/BasicShapes/Plane.Plane"), FVector(10.f, 10.f, 1.f), FLinearColor(0.3f, 0.3f, 0.3f));
		break;
	case EGwEntityKind::Water:
		ApplyPlaceholderMesh(Actor, TEXT("/Engine/BasicShapes/Plane.Plane"), FVector(10.f, 10.f, 1.f), FLinearColor(0.1f, 0.4f, 0.9f, 0.6f));
		break;
	case EGwEntityKind::Item:
		ApplyPlaceholderMesh(Actor, TEXT("/Engine/BasicShapes/Sphere.Sphere"), FVector(0.5f, 0.5f, 0.5f), FLinearColor(1.f, 0.3f, 0.42f));
		break;
	case EGwEntityKind::Light:
	{
		UPointLightComponent* Light = NewObject<UPointLightComponent>(Actor, TEXT("PlaceholderLight"));
		Light->SetLightColor(FLinearColor(1.f, 0.69f, 0.13f));
		Light->SetupAttachment(Actor->GetRootComponent());
		Light->RegisterComponent();
		break;
	}
	case EGwEntityKind::Camera:
	{
		UCameraComponent* Camera = NewObject<UCameraComponent>(Actor, TEXT("PlaceholderCamera"));
		Camera->SetupAttachment(Actor->GetRootComponent());
		Camera->RegisterComponent();
		break;
	}
	case EGwEntityKind::Trigger:
	case EGwEntityKind::Volume:
	{
		UBoxComponent* Box = NewObject<UBoxComponent>(Actor, TEXT("PlaceholderTrigger"));
		Box->SetBoxExtent(FVector(100.f));
		Box->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
		Box->SetCollisionResponseToAllChannels(ECR_Overlap);
		Box->SetupAttachment(Actor->GetRootComponent());
		Box->RegisterComponent();
		break;
	}
	case EGwEntityKind::Region:
	case EGwEntityKind::Zone:
	case EGwEntityKind::Group:
	default:
		// Purely organizational (or an unhandled/prop kind) — no default visual.
		break;
	}
}
