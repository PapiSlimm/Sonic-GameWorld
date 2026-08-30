#include "GameWorldSubsystem.h"
#include "GameWorldJson.h"
#include "HttpModule.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Dom/JsonValue.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

UGameWorldSubsystem* UGameWorldSubsystem::Get(const UObject* WorldContextObject)
{
	if (!WorldContextObject) return nullptr;
	const UWorld* World = GEngine ? GEngine->GetWorldFromContextObject(WorldContextObject, EGetWorldErrorMode::ReturnNull) : nullptr;
	const UGameInstance* GameInstance = World ? World->GetGameInstance() : nullptr;
	return GameInstance ? GameInstance->GetSubsystem<UGameWorldSubsystem>() : nullptr;
}

void UGameWorldSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	LoadSession();
}

void UGameWorldSubsystem::Deinitialize()
{
	Super::Deinitialize();
}

FString UGameWorldSubsystem::BuildUrl(const FString& Path) const
{
	FString Base = BaseUrl;
	Base.RemoveFromEnd(TEXT("/"));
	FString Suffix = Path.StartsWith(TEXT("/")) ? Path : TEXT("/") + Path;
	return Base + TEXT("/v1") + Suffix;
}

TSharedRef<IHttpRequest, ESPMode::ThreadSafe> UGameWorldSubsystem::CreateRequest(const FString& Verb, const FString& Path, const TSharedPtr<FJsonObject>& Body) const
{
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(BuildUrl(Path));
	Request->SetVerb(Verb);
	Request->SetHeader(TEXT("Accept"), TEXT("application/json"));
	Request->SetHeader(TEXT("X-GameWorld-SDK"), TEXT("unreal/1.0.0"));
	Request->SetTimeout(TimeoutSeconds);

	if (!Jwt.IsEmpty())
	{
		Request->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *Jwt));
	}
	else if (!ApiKey.IsEmpty())
	{
		Request->SetHeader(TEXT("x-api-key"), ApiKey);
	}

	if (Body.IsValid())
	{
		Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
		Request->SetContentAsString(FGameWorldJson::ObjectToString(Body));
	}

	return Request;
}

FGwApiError UGameWorldSubsystem::ParseError(FHttpResponsePtr Response, bool bConnectedSuccessfully)
{
	FGwApiError Error;
	if (!bConnectedSuccessfully || !Response.IsValid())
	{
		Error.StatusCode = 0;
		Error.Code = TEXT("NETWORK_ERROR");
		Error.Message = TEXT("Could not reach the GameWorld API.");
		return Error;
	}

	Error.StatusCode = Response->GetResponseCode();
	Error.Code = TEXT("UNKNOWN_ERROR");
	Error.Message = FString::Printf(TEXT("GameWorld API request failed with status %d"), Error.StatusCode);

	TSharedPtr<FJsonObject> Envelope = FGameWorldJson::StringToObject(Response->GetContentAsString());
	if (Envelope.IsValid())
	{
		const TSharedPtr<FJsonObject>* ErrorObj;
		if (Envelope->TryGetObjectField(TEXT("error"), ErrorObj))
		{
			Error.Code = FGameWorldJson::GetString(*ErrorObj, TEXT("code"), Error.Code);
			Error.Message = FGameWorldJson::GetString(*ErrorObj, TEXT("message"), Error.Message);
		}
	}
	return Error;
}

void UGameWorldSubsystem::SendJsonRequest(
	const FString& Verb,
	const FString& Path,
	const TSharedPtr<FJsonObject>& Body,
	FGwJsonSuccess OnSuccess,
	FGwJsonFailure OnError)
{
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = CreateRequest(Verb, Path, Body);

	Request->OnProcessRequestComplete().BindLambda(
		[OnSuccess, OnError](FHttpRequestPtr, FHttpResponsePtr Response, bool bConnectedSuccessfully)
		{
			const int32 Status = Response.IsValid() ? Response->GetResponseCode() : 0;
			if (!bConnectedSuccessfully || Status < 200 || Status >= 300)
			{
				if (OnError) OnError(ParseError(Response, bConnectedSuccessfully));
				return;
			}

			const FString Content = Response->GetContentAsString();
			TSharedPtr<FJsonObject> Result = Content.IsEmpty() ? MakeShared<FJsonObject>() : FGameWorldJson::StringToObject(Content);
			if (!Result.IsValid())
			{
				FGwApiError Error;
				Error.StatusCode = Status;
				Error.Code = TEXT("PARSE_ERROR");
				Error.Message = TEXT("Failed to parse GameWorld API response as JSON.");
				if (OnError) OnError(Error);
				return;
			}

			if (OnSuccess) OnSuccess(Result);
		});

	Request->ProcessRequest();
}

void UGameWorldSubsystem::SendJsonArrayRequest(
	const FString& Verb,
	const FString& Path,
	const TSharedPtr<FJsonObject>& Body,
	FGwJsonArraySuccess OnSuccess,
	FGwJsonFailure OnError)
{
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = CreateRequest(Verb, Path, Body);

	Request->OnProcessRequestComplete().BindLambda(
		[OnSuccess, OnError](FHttpRequestPtr, FHttpResponsePtr Response, bool bConnectedSuccessfully)
		{
			const int32 Status = Response.IsValid() ? Response->GetResponseCode() : 0;
			if (!bConnectedSuccessfully || Status < 200 || Status >= 300)
			{
				if (OnError) OnError(ParseError(Response, bConnectedSuccessfully));
				return;
			}

			TArray<TSharedPtr<FJsonValue>> Result;
			const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());
			if (!FJsonSerializer::Deserialize(Reader, Result))
			{
				FGwApiError Error;
				Error.StatusCode = Status;
				Error.Code = TEXT("PARSE_ERROR");
				Error.Message = TEXT("Failed to parse GameWorld API response as a JSON array.");
				if (OnError) OnError(Error);
				return;
			}

			if (OnSuccess) OnSuccess(Result);
		});

	Request->ProcessRequest();
}

void UGameWorldSubsystem::HandleAuthResponse(TSharedPtr<FJsonObject> Response)
{
	Jwt = FGameWorldJson::GetString(Response, TEXT("token"));
	RefreshToken = FGameWorldJson::GetString(Response, TEXT("refreshToken"));

	const TSharedPtr<FJsonObject>* UserObj;
	if (Response->TryGetObjectField(TEXT("user"), UserObj))
	{
		CurrentUser = FGameWorldJson::ParseAuthUser(*UserObj);
	}

	SaveSession();
	OnAuthSuccess.Broadcast(CurrentUser);
}

void UGameWorldSubsystem::DevLogin(const FString& Email)
{
	auto Body = MakeShared<FJsonObject>();
	Body->SetStringField(TEXT("email"), Email);

	SendJsonRequest(TEXT("POST"), TEXT("/auth/dev"), Body,
		[this](TSharedPtr<FJsonObject> Response) { HandleAuthResponse(Response); },
		[this](const FGwApiError& Error) { OnAuthError.Broadcast(Error.Message); });
}

void UGameWorldSubsystem::LoginWithFirebaseIdToken(const FString& IdToken)
{
	auto Body = MakeShared<FJsonObject>();
	Body->SetStringField(TEXT("idToken"), IdToken);

	SendJsonRequest(TEXT("POST"), TEXT("/auth/firebase"), Body,
		[this](TSharedPtr<FJsonObject> Response) { HandleAuthResponse(Response); },
		[this](const FGwApiError& Error) { OnAuthError.Broadcast(Error.Message); });
}

void UGameWorldSubsystem::RefreshSession()
{
	auto Body = MakeShared<FJsonObject>();
	Body->SetStringField(TEXT("refreshToken"), RefreshToken);

	SendJsonRequest(TEXT("POST"), TEXT("/auth/refresh"), Body,
		[this](TSharedPtr<FJsonObject> Response) { HandleAuthResponse(Response); },
		[this](const FGwApiError& Error) { OnAuthError.Broadcast(Error.Message); });
}

void UGameWorldSubsystem::FetchMe()
{
	SendJsonRequest(TEXT("GET"), TEXT("/auth/me"), nullptr,
		[this](TSharedPtr<FJsonObject> Response)
		{
			CurrentUser = FGameWorldJson::ParseAuthUser(Response);
			OnAuthSuccess.Broadcast(CurrentUser);
		},
		[this](const FGwApiError& Error) { OnAuthError.Broadcast(Error.Message); });
}

void UGameWorldSubsystem::SignOut()
{
	Jwt.Empty();
	RefreshToken.Empty();
	CurrentUser = FGwAuthUser();
	IFileManager::Get().Delete(*SessionFilePath());
}

FString UGameWorldSubsystem::SessionFilePath() const
{
	return FPaths::ProjectSavedDir() / TEXT("SonicGameWorld") / TEXT("session.json");
}

void UGameWorldSubsystem::LoadSession()
{
	FString Content;
	if (!FFileHelper::LoadFileToString(Content, *SessionFilePath())) return;

	TSharedPtr<FJsonObject> Object = FGameWorldJson::StringToObject(Content);
	if (!Object.IsValid()) return;

	Jwt = FGameWorldJson::GetString(Object, TEXT("token"));
	RefreshToken = FGameWorldJson::GetString(Object, TEXT("refreshToken"));

	const TSharedPtr<FJsonObject>* UserObj;
	if (Object->TryGetObjectField(TEXT("user"), UserObj))
	{
		CurrentUser = FGameWorldJson::ParseAuthUser(*UserObj);
	}
}

void UGameWorldSubsystem::SaveSession() const
{
	auto Object = MakeShared<FJsonObject>();
	Object->SetStringField(TEXT("token"), Jwt);
	Object->SetStringField(TEXT("refreshToken"), RefreshToken);

	auto UserObj = MakeShared<FJsonObject>();
	UserObj->SetStringField(TEXT("id"), CurrentUser.Id);
	UserObj->SetStringField(TEXT("email"), CurrentUser.Email);
	UserObj->SetStringField(TEXT("displayName"), CurrentUser.DisplayName);
	UserObj->SetStringField(TEXT("tier"), CurrentUser.Tier);
	Object->SetObjectField(TEXT("user"), UserObj);

	FFileHelper::SaveStringToFile(FGameWorldJson::ObjectToString(Object), *SessionFilePath());
}
