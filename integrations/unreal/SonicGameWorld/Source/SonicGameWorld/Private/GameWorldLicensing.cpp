#include "GameWorldLicensing.h"
#include "GameWorldSubsystem.h"
#include "GameWorldJson.h"
#include "Dom/JsonValue.h"

namespace
{
	FGwLicenseCompatibilityResult ParseCompatibilityResult(const TSharedPtr<FJsonObject>& Object)
	{
		FGwLicenseCompatibilityResult Result;
		if (!Object.IsValid()) return Result;
		Result.Status = FGwEnums::LicenseCompatibilityFromString(FGameWorldJson::GetString(Object, TEXT("status"), TEXT("GREEN")));
		Result.Reasons = FGameWorldJson::GetStringArray(Object, TEXT("reasons"));
		return Result;
	}
}

UGameWorldLicensing* UGameWorldLicensing::Create(UObject* Outer, UGameWorldSubsystem* InSubsystem)
{
	UGameWorldLicensing* Instance = NewObject<UGameWorldLicensing>(Outer ? Outer : GetTransientPackage());
	Instance->Subsystem = InSubsystem;
	return Instance;
}

void UGameWorldLicensing::GetLicense(const FString& LicenseId, FGwOnLicenseResult OnSuccess, FGwOnLicensingError OnError)
{
	if (!Subsystem) { OnError.ExecuteIfBound(TEXT("GameWorld subsystem not set.")); return; }

	Subsystem->SendJsonRequest(TEXT("GET"), TEXT("/licenses/") + LicenseId, nullptr,
		[OnSuccess](TSharedPtr<FJsonObject> Response) { OnSuccess.ExecuteIfBound(FGameWorldJson::ParseLicenseRecord(Response)); },
		[OnError](const FGwApiError& Error) { OnError.ExecuteIfBound(Error.Message); });
}

void UGameWorldLicensing::GetLicenseForProduct(const FString& ProductId, FGwOnLicenseResult OnSuccess, FGwOnLicensingError OnError)
{
	if (!Subsystem) { OnError.ExecuteIfBound(TEXT("GameWorld subsystem not set.")); return; }

	Subsystem->SendJsonRequest(TEXT("GET"), TEXT("/licenses/product/") + ProductId, nullptr,
		[OnSuccess](TSharedPtr<FJsonObject> Response) { OnSuccess.ExecuteIfBound(FGameWorldJson::ParseLicenseRecord(Response)); },
		[OnError](const FGwApiError& Error) { OnError.ExecuteIfBound(Error.Message); });
}

void UGameWorldLicensing::CheckCompatibility(
	const TArray<FGwLicenseRecord>& Licenses,
	const FGwLicenseIntent& Intent,
	FGwOnCompatibilityResult OnSuccess,
	FGwOnLicensingError OnError)
{
	if (!Subsystem) { OnError.ExecuteIfBound(TEXT("GameWorld subsystem not set.")); return; }

	TArray<TSharedPtr<FJsonValue>> LicensesJson;
	for (const FGwLicenseRecord& License : Licenses)
	{
		LicensesJson.Add(MakeShared<FJsonValueObject>(FGameWorldJson::Serialize(License)));
	}

	auto IntentObj = MakeShared<FJsonObject>();
	IntentObj->SetBoolField(TEXT("commercial"), Intent.bCommercial);
	IntentObj->SetBoolField(TEXT("multiplayer"), Intent.bMultiplayer);
	IntentObj->SetBoolField(TEXT("redistribute"), Intent.bRedistribute);
	IntentObj->SetBoolField(TEXT("modify"), Intent.bModify);

	auto Body = MakeShared<FJsonObject>();
	Body->SetArrayField(TEXT("licenses"), LicensesJson);
	Body->SetObjectField(TEXT("intent"), IntentObj);

	Subsystem->SendJsonRequest(TEXT("POST"), TEXT("/licenses/check"), Body,
		[OnSuccess](TSharedPtr<FJsonObject> Response) { OnSuccess.ExecuteIfBound(ParseCompatibilityResult(Response)); },
		[OnError](const FGwApiError& Error) { OnError.ExecuteIfBound(Error.Message); });
}

void UGameWorldLicensing::GetAssetPassport(const FString& AssetId, FGwOnAssetPassportResult OnSuccess, FGwOnLicensingError OnError)
{
	if (!Subsystem) { OnError.ExecuteIfBound(TEXT("GameWorld subsystem not set.")); return; }

	Subsystem->SendJsonRequest(TEXT("GET"), FString::Printf(TEXT("/assets/%s/passport"), *AssetId), nullptr,
		[OnSuccess](TSharedPtr<FJsonObject> Response) { OnSuccess.ExecuteIfBound(FGameWorldJson::ParseAssetPassport(Response)); },
		[OnError](const FGwApiError& Error) { OnError.ExecuteIfBound(Error.Message); });
}

FGwLicenseCompatibilityResult UGameWorldLicensing::CheckCompatibilityLocal(const TArray<FGwLicenseRecord>& Licenses, const FGwLicenseIntent& Intent)
{
	FGwLicenseCompatibilityResult Result;
	Result.Status = EGwLicenseCompatibility::Green;

	for (const FGwLicenseRecord& License : Licenses)
	{
		if (Intent.bCommercial && !License.bCommercial)
		{
			Result.Reasons.Add(FString::Printf(TEXT("License '%s' does not permit commercial use."), *License.Id));
			Result.Status = EGwLicenseCompatibility::Red;
		}
		if (Intent.bMultiplayer && !License.bMultiplayer)
		{
			Result.Reasons.Add(FString::Printf(TEXT("License '%s' does not permit multiplayer use."), *License.Id));
			Result.Status = EGwLicenseCompatibility::Red;
		}
		if (Intent.bRedistribute && !License.bRedistribution)
		{
			Result.Reasons.Add(FString::Printf(TEXT("License '%s' does not permit redistribution."), *License.Id));
			Result.Status = EGwLicenseCompatibility::Red;
		}
		if (Intent.bModify && !License.bModification)
		{
			Result.Reasons.Add(FString::Printf(TEXT("License '%s' does not permit modification."), *License.Id));
			Result.Status = EGwLicenseCompatibility::Red;
		}
		if (License.bAttribution && Result.Status != EGwLicenseCompatibility::Red)
		{
			Result.Reasons.Add(License.AttributionText.IsEmpty()
				? FString::Printf(TEXT("License '%s' requires attribution."), *License.Id)
				: FString::Printf(TEXT("License '%s' requires attribution: \"%s\"."), *License.Id, *License.AttributionText));
			if (Result.Status == EGwLicenseCompatibility::Green) Result.Status = EGwLicenseCompatibility::Yellow;
		}
	}

	return Result;
}
