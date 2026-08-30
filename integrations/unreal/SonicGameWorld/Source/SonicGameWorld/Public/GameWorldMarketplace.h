// Marketplace browsing/purchasing (CONTRACTS.md §9 "marketplace"). Construct via
// `UGameWorldMarketplace::Create(this, Subsystem)` — a thin, stateless wrapper over
// UGameWorldSubsystem::SendJsonRequest, mirroring SonicGameWorld.GameWorldMarketplace in the
// Unity SDK and the Unreal loader's marketplace import path.
#pragma once

#include "CoreMinimal.h"
#include "GameWorldTypes.h"
#include "GameWorldMarketplace.generated.h"

class UGameWorldSubsystem;

DECLARE_DYNAMIC_DELEGATE_OneParam(FGwOnSearchResult, const FGwMarketplaceSearchResult&, Result);
DECLARE_DYNAMIC_DELEGATE_OneParam(FGwOnProductDetail, const FGwProductSummary&, Product);
DECLARE_DYNAMIC_DELEGATE_OneParam(FGwOnWorldDocumentResult, const FGwWorldDocument&, Document);
DECLARE_DYNAMIC_DELEGATE_OneParam(FGwOnMarketplaceError, const FString&, ErrorMessage);

UCLASS(BlueprintType)
class SONICGAMEWORLD_API UGameWorldMarketplace : public UObject
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Marketplace")
	static UGameWorldMarketplace* Create(UObject* Outer, UGameWorldSubsystem* InSubsystem);

	/** `GET /v1/marketplace/search?q=&category=&genre=&engine=&cursor=&limit=` */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Marketplace")
	void Search(
		const FString& Query,
		const FString& Category,
		const FString& Genre,
		const FString& Engine,
		int32 Limit,
		FGwOnSearchResult OnSuccess,
		FGwOnMarketplaceError OnError);

	/** `GET /v1/marketplace/featured` */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Marketplace")
	void Featured(FGwOnSearchResult OnSuccess, FGwOnMarketplaceError OnError);

	/** `GET /v1/products/:slug` */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Marketplace")
	void GetProduct(const FString& Slug, FGwOnProductDetail OnSuccess, FGwOnMarketplaceError OnError);

	/** `POST /v1/cart/items` */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Marketplace")
	void AddToCart(const FString& ProductId, const FString& VersionId, FGwOnMarketplaceError OnError);

	/** `POST /v1/orders` — checks out the given product/version directly (bypassing the cart). */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Marketplace")
	void Checkout(const FString& ProductId, const FString& VersionId, FGwOnMarketplaceError OnError);

	/**
	 * Verifies the product is owned/free and resolves its World document, ready for
	 * UGameWorldLoader to spawn. Only WORLD-category products are supported today.
	 */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Marketplace")
	void ImportProduct(const FString& ProductId, FGwOnWorldDocumentResult OnSuccess, FGwOnMarketplaceError OnError);

private:
	UPROPERTY()
	TObjectPtr<UGameWorldSubsystem> Subsystem;
};
