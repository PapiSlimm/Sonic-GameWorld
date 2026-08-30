// GameWorld AI orchestrator client (CONTRACTS.md §8, §9 "ai"). AI never mutates world state
// directly on the client — every command is sent to the server, validated against
// permissions/quotas/license compatibility, executed, and the resulting tool executions are
// returned for the caller to reflect locally (e.g. by re-fetching the world document via
// UGameWorldLoader, or applying FGwToolExecution results directly to an already-spawned
// AGameWorldWorldActor hierarchy). Mirrors SonicGameWorld.GameWorldAI in the Unity SDK.
#pragma once

#include "CoreMinimal.h"
#include "GameWorldTypes.h"
#include "GameWorldAI.generated.h"

class UGameWorldSubsystem;

DECLARE_DYNAMIC_DELEGATE_OneParam(FGwOnAICommandResult, const FGwAICommandResponse&, Response);
DECLARE_DYNAMIC_DELEGATE_OneParam(FGwOnToolExecutionResult, const FGwToolExecution&, Execution);
DECLARE_DYNAMIC_DELEGATE_OneParam(FGwOnToolNames, const TArray<FString>&, Tools);
/** Each entry is one page item re-serialized to a raw JSON string (an FGwToolExecution); parse
 * with `FGameWorldJson::ParseToolExecution(FGameWorldJson::StringToObject(Item))` as needed. */
DECLARE_DYNAMIC_DELEGATE_OneParam(FGwOnRawJsonItems, const TArray<FString>&, ItemsJson);
DECLARE_DYNAMIC_DELEGATE_OneParam(FGwOnUsageJson, const FString&, UsageJson);
DECLARE_DYNAMIC_DELEGATE_OneParam(FGwOnAIError, const FString&, ErrorMessage);

UCLASS(BlueprintType)
class SONICGAMEWORLD_API UGameWorldAI : public UObject
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "GameWorld|AI")
	static UGameWorldAI* Create(UObject* Outer, UGameWorldSubsystem* InSubsystem);

	/** `POST /v1/ai/command` — natural-language command against a world, e.g.
	 * `Command("world-123", "spawn 3 enemies near building 7", "DIRECTOR", false, ...)`. */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|AI")
	void Command(
		const FString& WorldId,
		const FString& Text,
		const FString& Mode,
		bool bVoice,
		FGwOnAICommandResult OnSuccess,
		FGwOnAIError OnError);

	/** `POST /v1/ai/generate` — direct content generation (e.g. `generate_asset`) outside the command pipeline.
	 * `RequestJson` is a raw JSON object body; keep call sites free of a bespoke request USTRUCT per tool. */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|AI")
	void Generate(const FString& RequestJson, FGwOnToolExecutionResult OnSuccess, FGwOnAIError OnError);

	/** `GET /v1/ai/tools` — AIToolName values available to the current account/tier. */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|AI")
	void ListTools(FGwOnToolNames OnSuccess, FGwOnAIError OnError);

	/** `GET /v1/ai/executions?cursor=` — execution history, e.g. for an in-game AI Director log panel. */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|AI")
	void ListExecutions(const FString& Cursor, FGwOnRawJsonItems OnSuccess, FGwOnAIError OnError);

	/** `GET /v1/ai/usage` — token/tool-call usage for the current billing period, as raw JSON
	 * (the response shape is billing-plan-dependent; parse the fields you need on the call site). */
	UFUNCTION(BlueprintCallable, Category = "GameWorld|AI")
	void GetUsage(FGwOnUsageJson OnSuccess, FGwOnAIError OnError);

private:
	UPROPERTY()
	TObjectPtr<UGameWorldSubsystem> Subsystem;
};
