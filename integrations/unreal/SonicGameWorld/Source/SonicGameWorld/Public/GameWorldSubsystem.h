// The Unreal counterpart of the Unity SDK's GameWorldClient + GameWorldHttp: one
// GameInstanceSubsystem owns the base URL, credentials and the low-level JSON HTTP transport
// that every other GameWorld class (UGameWorldMarketplace, UGameWorldAI, UGameWorldLicensing,
// UGameWorldLoader) is constructed against. Add it to your GameInstance automatically (Unreal
// creates one instance per GameInstance) and fetch it with
// `UGameWorldSubsystem::Get(this)` from anywhere with a UWorld/UObject context.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Interfaces/IHttpRequest.h"
#include "GameWorldTypes.h"
#include "GameWorldSubsystem.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FGwOnAuthUser, const FGwAuthUser&, User);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FGwOnError, const FString&, ErrorMessage);

/** Raised by low-level JSON calls; carries the same shape as the TypeScript SDK's ApiError. */
USTRUCT(BlueprintType)
struct SONICGAMEWORLD_API FGwApiError
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "GameWorld")
	int32 StatusCode = 0;

	UPROPERTY(BlueprintReadOnly, Category = "GameWorld")
	FString Code;

	UPROPERTY(BlueprintReadOnly, Category = "GameWorld")
	FString Message;
};

/** C++-only callback shapes used by the manager classes (UGameWorldMarketplace, UGameWorldAI, ...). */
using FGwJsonSuccess = TFunction<void(TSharedPtr<FJsonObject>)>;
using FGwJsonArraySuccess = TFunction<void(const TArray<TSharedPtr<FJsonValue>>&)>;
using FGwJsonFailure = TFunction<void(const FGwApiError&)>;

UCLASS(BlueprintType)
class SONICGAMEWORLD_API UGameWorldSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	/** Convenience accessor from any UObject with a valid world/game instance. */
	UFUNCTION(BlueprintCallable, Category = "GameWorld", meta = (WorldContext = "WorldContextObject"))
	static UGameWorldSubsystem* Get(const UObject* WorldContextObject);

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/** GameWorld API base URL, no trailing slash and no /v1 suffix. Defaults to the production API. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld|Config")
	FString BaseUrl = TEXT("https://api.sonicgameworld.com");

	/** Server-issued API key (gw_live_.../gw_test_...) used when no user JWT is present.
	 * Suitable for dedicated servers and editor tooling; do NOT ship a production key in a client build. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld|Config")
	FString ApiKey;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "GameWorld|Config")
	float TimeoutSeconds = 30.f;

	UPROPERTY(BlueprintReadOnly, Category = "GameWorld|Auth")
	FGwAuthUser CurrentUser;

	UFUNCTION(BlueprintPure, Category = "GameWorld|Auth")
	bool IsAuthenticated() const { return !Jwt.IsEmpty(); }

	// ---- Auth (CONTRACTS.md §3) ----

	/** `POST /v1/auth/dev` — email-only login, only works when the API is not running with NODE_ENV=production. */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Auth")
	void DevLogin(const FString& Email);

	/** `POST /v1/auth/firebase` — exchanges a Firebase ID token (Firebase Unreal SDK) for a GameWorld JWT. */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Auth")
	void LoginWithFirebaseIdToken(const FString& IdToken);

	/** `POST /v1/auth/refresh` using the stored refresh token. */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Auth")
	void RefreshSession();

	/** `GET /v1/auth/me`. */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|Auth")
	void FetchMe();

	UFUNCTION(BlueprintCallable, Category = "GameWorld|Auth")
	void SignOut();

	UPROPERTY(BlueprintAssignable, Category = "GameWorld|Auth")
	FGwOnAuthUser OnAuthSuccess;

	UPROPERTY(BlueprintAssignable, Category = "GameWorld|Auth")
	FGwOnError OnAuthError;

	// ---- Low-level transport, used by UGameWorldMarketplace / UGameWorldAI / UGameWorldLicensing / UGameWorldLoader ----

	/** Fires a JSON request against `{BaseUrl}/v1{Path}`. `Body` may be null for GET/DELETE. */
	void SendJsonRequest(
		const FString& Verb,
		const FString& Path,
		const TSharedPtr<FJsonObject>& Body,
		FGwJsonSuccess OnSuccess,
		FGwJsonFailure OnError);

	/** Same as SendJsonRequest but for endpoints whose success body is a bare JSON array (e.g. `GET /ai/tools`). */
	void SendJsonArrayRequest(
		const FString& Verb,
		const FString& Path,
		const TSharedPtr<FJsonObject>& Body,
		FGwJsonArraySuccess OnSuccess,
		FGwJsonFailure OnError);

	FString GetToken() const { return Jwt; }

private:
	FString Jwt;
	FString RefreshToken;

	FString BuildUrl(const FString& Path) const;
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> CreateRequest(const FString& Verb, const FString& Path, const TSharedPtr<FJsonObject>& Body) const;
	void HandleAuthResponse(TSharedPtr<FJsonObject> Response);
	static FGwApiError ParseError(FHttpResponsePtr Response, bool bConnectedSuccessfully);

	FString SessionFilePath() const;
	void LoadSession();
	void SaveSession() const;
};
