// Slate widget backing the "Sonic GameWorld" editor dashboard tab. Owns its own lightweight,
// editor-lifetime HTTP session (independent of UGameWorldSubsystem, which is a
// GameInstanceSubsystem and therefore only alive while a game instance — e.g. PIE — is
// running) so sign-in, marketplace search/import and publish all work with no Play session,
// mirroring the Unity SDK's GameWorldWindow.
#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "GameWorldTypes.h"

class SVerticalBox;
class SEditableTextBox;
class SMultiLineEditableTextBox;

class SGameWorldEditorPanel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SGameWorldEditorPanel) {}
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	// ---- config / session state ----
	FString BaseUrl = TEXT("https://api.sonicgameworld.com");
	FString Email = TEXT("creator@example.com");
	FString ApiKey;
	FString Jwt;
	FString StatusText;

	FString SearchQuery;
	FString SearchCategory;
	TArray<FGwProductSummary> SearchResults;

	TSharedPtr<SVerticalBox> ResultsBox;
	TSharedPtr<class STextBlock> StatusBlock;

	// ---- UI sections ----
	TSharedRef<SWidget> BuildLoginSection();
	TSharedRef<SWidget> BuildMarketplaceSection();
	TSharedRef<SWidget> BuildPublishSection();
	void RebuildResults();

	// ---- actions ----
	FReply OnSignInClicked();
	FReply OnUseApiKeyClicked();
	FReply OnSignOutClicked();
	FReply OnSearchClicked();
	FReply OnImportClicked(FGwProductSummary Product);
	FReply OnPublishClicked();

	void SetStatus(const FString& Text);

	// ---- transport (mirrors UGameWorldSubsystem::SendJsonRequest, but editor-lifetime) ----
	using FJsonSuccess = TFunction<void(TSharedPtr<class FJsonObject>)>;
	using FJsonFailure = TFunction<void(const FString&)>;
	void SendJsonRequest(const FString& Verb, const FString& Path, const TSharedPtr<class FJsonObject>& Body, FJsonSuccess OnSuccess, FJsonFailure OnError);
};
