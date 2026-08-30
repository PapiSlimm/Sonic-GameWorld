#include "GameWorldMarketplace.h"
#include "GameWorldSubsystem.h"
#include "GameWorldJson.h"
#include "Dom/JsonValue.h"
#include "GenericPlatform/GenericPlatformHttp.h"

UGameWorldMarketplace* UGameWorldMarketplace::Create(UObject* Outer, UGameWorldSubsystem* InSubsystem)
{
	UGameWorldMarketplace* Instance = NewObject<UGameWorldMarketplace>(Outer);
	Instance->Subsystem = InSubsystem;
	return Instance;
}

void UGameWorldMarketplace::Search(
	const FString& Query,
	const FString& Category,
	const FString& Genre,
	const FString& Engine,
	int32 Limit,
	FGwOnSearchResult OnSuccess,
	FGwOnMarketplaceError OnError)
{
	if (!Subsystem) { OnError.ExecuteIfBound(TEXT("GameWorld subsystem not set.")); return; }

	FString Path = FString::Printf(TEXT("/marketplace/search?limit=%d"), FMath::Max(1, Limit));
	if (!Query.IsEmpty()) Path += TEXT("&q=") + FGenericPlatformHttp::UrlEncode(Query);
	if (!Category.IsEmpty()) Path += TEXT("&category=") + Category;
	if (!Genre.IsEmpty()) Path += TEXT("&genre=") + Genre;
	if (!Engine.IsEmpty()) Path += TEXT("&engine=") + Engine;

	Subsystem->SendJsonRequest(TEXT("GET"), Path, nullptr,
		[OnSuccess](TSharedPtr<FJsonObject> Response) { OnSuccess.ExecuteIfBound(FGameWorldJson::ParseMarketplaceSearchResult(Response)); },
		[OnError](const FGwApiError& Error) { OnError.ExecuteIfBound(Error.Message); });
}

void UGameWorldMarketplace::Featured(FGwOnSearchResult OnSuccess, FGwOnMarketplaceError OnError)
{
	if (!Subsystem) { OnError.ExecuteIfBound(TEXT("GameWorld subsystem not set.")); return; }

	Subsystem->SendJsonRequest(TEXT("GET"), TEXT("/marketplace/featured"), nullptr,
		[OnSuccess](TSharedPtr<FJsonObject> Response) { OnSuccess.ExecuteIfBound(FGameWorldJson::ParseMarketplaceSearchResult(Response)); },
		[OnError](const FGwApiError& Error) { OnError.ExecuteIfBound(Error.Message); });
}

void UGameWorldMarketplace::GetProduct(const FString& Slug, FGwOnProductDetail OnSuccess, FGwOnMarketplaceError OnError)
{
	if (!Subsystem) { OnError.ExecuteIfBound(TEXT("GameWorld subsystem not set.")); return; }

	Subsystem->SendJsonRequest(TEXT("GET"), TEXT("/products/") + Slug, nullptr,
		[OnSuccess](TSharedPtr<FJsonObject> Response) { OnSuccess.ExecuteIfBound(FGameWorldJson::ParseProductSummary(Response)); },
		[OnError](const FGwApiError& Error) { OnError.ExecuteIfBound(Error.Message); });
}

void UGameWorldMarketplace::AddToCart(const FString& ProductId, const FString& VersionId, FGwOnMarketplaceError OnError)
{
	if (!Subsystem) { OnError.ExecuteIfBound(TEXT("GameWorld subsystem not set.")); return; }

	auto Body = MakeShared<FJsonObject>();
	Body->SetStringField(TEXT("productId"), ProductId);
	if (!VersionId.IsEmpty()) Body->SetStringField(TEXT("versionId"), VersionId);

	Subsystem->SendJsonRequest(TEXT("POST"), TEXT("/cart/items"), Body,
		[](TSharedPtr<FJsonObject>) {},
		[OnError](const FGwApiError& Error) { OnError.ExecuteIfBound(Error.Message); });
}

void UGameWorldMarketplace::Checkout(const FString& ProductId, const FString& VersionId, FGwOnMarketplaceError OnError)
{
	if (!Subsystem) { OnError.ExecuteIfBound(TEXT("GameWorld subsystem not set.")); return; }

	auto Body = MakeShared<FJsonObject>();
	Body->SetStringField(TEXT("productId"), ProductId);
	if (!VersionId.IsEmpty()) Body->SetStringField(TEXT("versionId"), VersionId);

	Subsystem->SendJsonRequest(TEXT("POST"), TEXT("/orders"), Body,
		[](TSharedPtr<FJsonObject>) {},
		[OnError](const FGwApiError& Error) { OnError.ExecuteIfBound(Error.Message); });
}

void UGameWorldMarketplace::ImportProduct(const FString& ProductId, FGwOnWorldDocumentResult OnSuccess, FGwOnMarketplaceError OnError)
{
	if (!Subsystem) { OnError.ExecuteIfBound(TEXT("GameWorld subsystem not set.")); return; }

	TWeakObjectPtr<UGameWorldSubsystem> WeakSubsystem(Subsystem);

	Subsystem->SendJsonRequest(TEXT("GET"), TEXT("/products/") + ProductId, nullptr,
		[WeakSubsystem, OnSuccess, OnError](TSharedPtr<FJsonObject> ProductResponse)
		{
			if (!WeakSubsystem.IsValid()) { OnError.ExecuteIfBound(TEXT("GameWorld subsystem destroyed.")); return; }

			const FString Category = FGameWorldJson::GetString(ProductResponse, TEXT("category"));
			if (Category != TEXT("WORLD"))
			{
				OnError.ExecuteIfBound(FString::Printf(TEXT("ImportProduct currently supports WORLD products only (got %s)."), *Category));
				return;
			}

			const FString WorldId = FGameWorldJson::GetString(ProductResponse, TEXT("id"));
			WeakSubsystem->SendJsonRequest(TEXT("GET"), FString::Printf(TEXT("/worlds/%s/document"), *WorldId), nullptr,
				[OnSuccess](TSharedPtr<FJsonObject> DocResponse) { OnSuccess.ExecuteIfBound(FGameWorldJson::ParseWorldDocument(DocResponse)); },
				[OnError](const FGwApiError& Error) { OnError.ExecuteIfBound(Error.Message); });
		},
		[OnError](const FGwApiError& Error) { OnError.ExecuteIfBound(Error.Message); });
}
