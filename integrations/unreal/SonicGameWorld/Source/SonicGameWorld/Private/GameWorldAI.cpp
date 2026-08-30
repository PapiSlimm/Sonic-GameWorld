#include "GameWorldAI.h"
#include "GameWorldSubsystem.h"
#include "GameWorldJson.h"
#include "Dom/JsonValue.h"

UGameWorldAI* UGameWorldAI::Create(UObject* Outer, UGameWorldSubsystem* InSubsystem)
{
	UGameWorldAI* Instance = NewObject<UGameWorldAI>(Outer ? Outer : GetTransientPackage());
	Instance->Subsystem = InSubsystem;
	return Instance;
}

void UGameWorldAI::Command(
	const FString& WorldId,
	const FString& Text,
	const FString& Mode,
	bool bVoice,
	FGwOnAICommandResult OnSuccess,
	FGwOnAIError OnError)
{
	if (!Subsystem) { OnError.ExecuteIfBound(TEXT("GameWorld subsystem not set.")); return; }

	auto Body = MakeShared<FJsonObject>();
	Body->SetStringField(TEXT("worldId"), WorldId);
	Body->SetStringField(TEXT("text"), Text);
	Body->SetStringField(TEXT("mode"), Mode.IsEmpty() ? TEXT("DIRECTOR") : Mode);
	Body->SetBoolField(TEXT("voice"), bVoice);

	Subsystem->SendJsonRequest(TEXT("POST"), TEXT("/ai/command"), Body,
		[OnSuccess](TSharedPtr<FJsonObject> Response) { OnSuccess.ExecuteIfBound(FGameWorldJson::ParseAICommandResponse(Response)); },
		[OnError](const FGwApiError& Error) { OnError.ExecuteIfBound(Error.Message); });
}

void UGameWorldAI::Generate(const FString& RequestJson, FGwOnToolExecutionResult OnSuccess, FGwOnAIError OnError)
{
	if (!Subsystem) { OnError.ExecuteIfBound(TEXT("GameWorld subsystem not set.")); return; }

	TSharedPtr<FJsonObject> Body = RequestJson.IsEmpty() ? MakeShared<FJsonObject>() : FGameWorldJson::StringToObject(RequestJson);
	if (!Body.IsValid())
	{
		OnError.ExecuteIfBound(TEXT("RequestJson is not valid JSON."));
		return;
	}

	Subsystem->SendJsonRequest(TEXT("POST"), TEXT("/ai/generate"), Body,
		[OnSuccess](TSharedPtr<FJsonObject> Response) { OnSuccess.ExecuteIfBound(FGameWorldJson::ParseToolExecution(Response)); },
		[OnError](const FGwApiError& Error) { OnError.ExecuteIfBound(Error.Message); });
}

void UGameWorldAI::ListTools(FGwOnToolNames OnSuccess, FGwOnAIError OnError)
{
	if (!Subsystem) { OnError.ExecuteIfBound(TEXT("GameWorld subsystem not set.")); return; }

	Subsystem->SendJsonArrayRequest(TEXT("GET"), TEXT("/ai/tools"), nullptr,
		[OnSuccess](const TArray<TSharedPtr<FJsonValue>>& Response)
		{
			TArray<FString> Tools;
			for (const auto& Item : Response)
			{
				FString S;
				if (Item->TryGetString(S)) Tools.Add(S);
			}
			OnSuccess.ExecuteIfBound(Tools);
		},
		[OnError](const FGwApiError& Error) { OnError.ExecuteIfBound(Error.Message); });
}

void UGameWorldAI::ListExecutions(const FString& Cursor, FGwOnRawJsonItems OnSuccess, FGwOnAIError OnError)
{
	if (!Subsystem) { OnError.ExecuteIfBound(TEXT("GameWorld subsystem not set.")); return; }

	// `GET /v1/ai/executions` returns a Page<ToolExecution> envelope (`{ items, nextCursor }`),
	// not a bare array, so this goes through SendJsonRequest and unpacks `items` itself.
	FString Path = TEXT("/ai/executions");
	if (!Cursor.IsEmpty()) Path += TEXT("?cursor=") + Cursor;

	Subsystem->SendJsonRequest(TEXT("GET"), Path, nullptr,
		[OnSuccess](TSharedPtr<FJsonObject> Response)
		{
			TArray<FString> ItemsJson;
			const TArray<TSharedPtr<FJsonValue>>* Items;
			if (Response.IsValid() && Response->TryGetArrayField(TEXT("items"), Items))
			{
				for (const auto& Item : *Items)
				{
					if (TSharedPtr<FJsonObject> ItemObj = Item->AsObject())
					{
						ItemsJson.Add(FGameWorldJson::ObjectToString(ItemObj));
					}
				}
			}
			OnSuccess.ExecuteIfBound(ItemsJson);
		},
		[OnError](const FGwApiError& Error) { OnError.ExecuteIfBound(Error.Message); });
}

void UGameWorldAI::GetUsage(FGwOnUsageJson OnSuccess, FGwOnAIError OnError)
{
	if (!Subsystem) { OnError.ExecuteIfBound(TEXT("GameWorld subsystem not set.")); return; }

	Subsystem->SendJsonRequest(TEXT("GET"), TEXT("/ai/usage"), nullptr,
		[OnSuccess](TSharedPtr<FJsonObject> Response) { OnSuccess.ExecuteIfBound(FGameWorldJson::ObjectToString(Response)); },
		[OnError](const FGwApiError& Error) { OnError.ExecuteIfBound(Error.Message); });
}
