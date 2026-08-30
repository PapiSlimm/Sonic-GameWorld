// Licensing & Asset Passport lookups (CONTRACTS.md §6 LicenseRecord/AssetPassport, §9
// "licensing"). Every asset imported through UGameWorldLoader or the editor marketplace
// browser should be checked here before being bundled into a shipped build. Mirrors
// SonicGameWorld.GameWorldLicense in the Unity SDK, including its offline compatibility check.
#pragma once

#include "CoreMinimal.h"
#include "GameWorldTypes.h"
#include "GameWorldLicensing.generated.h"

class UGameWorldSubsystem;

DECLARE_DYNAMIC_DELEGATE_OneParam(FGwOnLicenseResult, const FGwLicenseRecord&, License);
DECLARE_DYNAMIC_DELEGATE_OneParam(FGwOnCompatibilityResult, const FGwLicenseCompatibilityResult&, Result);
DECLARE_DYNAMIC_DELEGATE_OneParam(FGwOnAssetPassportResult, const FGwAssetPassport&, Passport);
DECLARE_DYNAMIC_DELEGATE_OneParam(FGwOnLicensingError, const FString&, ErrorMessage);

/** What the caller intends to do with a set of licensed assets — mirrors FGwLicenseIntent's
 * fields but is BlueprintCallable-friendly as a standalone (non-USTRUCT-arg) function set. */
UCLASS(BlueprintType)
class SONICGAMEWORLD_API UGameWorldLicensing : public UObject
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Licensing")
	static UGameWorldLicensing* Create(UObject* Outer, UGameWorldSubsystem* InSubsystem);

	/** `GET /v1/licenses/:id` */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Licensing")
	void GetLicense(const FString& LicenseId, FGwOnLicenseResult OnSuccess, FGwOnLicensingError OnError);

	/** `GET /v1/licenses/product/:productId` */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Licensing")
	void GetLicenseForProduct(const FString& ProductId, FGwOnLicenseResult OnSuccess, FGwOnLicensingError OnError);

	/** `POST /v1/licenses/check` — server-side compatibility engine. Prefer this over
	 * CheckCompatibilityLocal for anything that gates a real purchase or publish action, since
	 * the server is the source of truth and may apply platform-side overrides. */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Licensing")
	void CheckCompatibility(
		const TArray<FGwLicenseRecord>& Licenses,
		const FGwLicenseIntent& Intent,
		FGwOnCompatibilityResult OnSuccess,
		FGwOnLicensingError OnError);

	/** `GET /v1/assets/:id/passport` */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Licensing")
	void GetAssetPassport(const FString& AssetId, FGwOnAssetPassportResult OnSuccess, FGwOnLicensingError OnError);

	/**
	 * Same rule set as `checkLicenseCompatibility` in `@sonic-gameworld/world-schema`, evaluated
	 * locally for instant UI feedback (e.g. while dragging an asset into a level in-editor, before
	 * round-tripping to the server). GREEN if every license permits the intent, RED if any
	 * explicitly forbids it, YELLOW for attribution-only friction.
	 */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Licensing")
	static FGwLicenseCompatibilityResult CheckCompatibilityLocal(const TArray<FGwLicenseRecord>& Licenses, const FGwLicenseIntent& Intent);

private:
	UPROPERTY()
	TObjectPtr<UGameWorldSubsystem> Subsystem;
};
