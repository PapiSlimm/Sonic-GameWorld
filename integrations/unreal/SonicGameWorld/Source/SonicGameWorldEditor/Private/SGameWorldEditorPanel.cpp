#include "SGameWorldEditorPanel.h"
#include "GameWorldJson.h"
#include "GameWorldLoader.h"

#include "Editor.h"
#include "EngineUtils.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Dom/JsonValue.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SSeparator.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Text/STextBlock.h"

#define LOCTEXT_NAMESPACE "SGameWorldEditorPanel"

void SGameWorldEditorPanel::Construct(const FArguments& InArgs)
{
	ChildSlot
	[
		SNew(SScrollBox)
		+ SScrollBox::Slot().Padding(8)
		[
			SNew(SVerticalBox)

			+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 8)
			[
				SNew(STextBlock)
				.Text(LOCTEXT("Title", "Sonic GameWorld"))
				.Font(FCoreStyle::GetDefaultFontStyle("Bold", 14))
			]

			+ SVerticalBox::Slot().AutoHeight().Padding(0, 4) [ BuildLoginSection() ]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 8) [ SNew(SSeparator) ]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 4) [ BuildMarketplaceSection() ]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 8) [ SNew(SSeparator) ]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 4) [ BuildPublishSection() ]

			+ SVerticalBox::Slot().AutoHeight().Padding(0, 12, 0, 0)
			[
				SAssignNew(StatusBlock, STextBlock)
				.AutoWrapText(true)
				.Text(FText::GetEmpty())
			]
		]
	];
}

TSharedRef<SWidget> SGameWorldEditorPanel::BuildLoginSection()
{
	return SNew(SVerticalBox)

	+ SVerticalBox::Slot().AutoHeight().Padding(0, 2)
	[
		SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 6, 0) [ SNew(STextBlock).Text(LOCTEXT("BaseUrl", "Base URL")) ]
		+ SHorizontalBox::Slot().FillWidth(1.f)
		[
			SNew(SEditableTextBox)
			.Text(FText::FromString(BaseUrl))
			.OnTextCommitted_Lambda([this](const FText& Text, ETextCommit::Type) { BaseUrl = Text.ToString(); })
		]
	]

	+ SVerticalBox::Slot().AutoHeight().Padding(0, 6, 0, 2) [ SNew(STextBlock).Text(LOCTEXT("DevLogin", "Dev login (non-production API only)")) ]
	+ SVerticalBox::Slot().AutoHeight().Padding(0, 2)
	[
		SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 6, 0) [ SNew(STextBlock).Text(LOCTEXT("Email", "Email")) ]
		+ SHorizontalBox::Slot().FillWidth(1.f)
		[
			SNew(SEditableTextBox)
			.Text(FText::FromString(Email))
			.OnTextCommitted_Lambda([this](const FText& Text, ETextCommit::Type) { Email = Text.ToString(); })
		]
		+ SHorizontalBox::Slot().AutoWidth().Padding(6, 0, 0, 0) [ SNew(SButton).Text(LOCTEXT("SignIn", "Sign in")).OnClicked(this, &SGameWorldEditorPanel::OnSignInClicked) ]
	]

	+ SVerticalBox::Slot().AutoHeight().Padding(0, 6, 0, 2) [ SNew(STextBlock).Text(LOCTEXT("ApiKeyLabel", "Or authenticate with an API key")) ]
	+ SVerticalBox::Slot().AutoHeight().Padding(0, 2)
	[
		SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 6, 0) [ SNew(STextBlock).Text(LOCTEXT("ApiKey", "API Key")) ]
		+ SHorizontalBox::Slot().FillWidth(1.f)
		[
			SNew(SEditableTextBox)
			.Text(FText::FromString(ApiKey))
			.OnTextCommitted_Lambda([this](const FText& Text, ETextCommit::Type) { ApiKey = Text.ToString(); })
		]
		+ SHorizontalBox::Slot().AutoWidth().Padding(6, 0, 0, 0) [ SNew(SButton).Text(LOCTEXT("UseApiKey", "Use API Key")).OnClicked(this, &SGameWorldEditorPanel::OnUseApiKeyClicked) ]
		+ SHorizontalBox::Slot().AutoWidth().Padding(6, 0, 0, 0) [ SNew(SButton).Text(LOCTEXT("SignOut", "Sign out")).OnClicked(this, &SGameWorldEditorPanel::OnSignOutClicked) ]
	];
}

TSharedRef<SWidget> SGameWorldEditorPanel::BuildMarketplaceSection()
{
	return SNew(SVerticalBox)

	+ SVerticalBox::Slot().AutoHeight().Padding(0, 2) [ SNew(STextBlock).Text(LOCTEXT("Marketplace", "Marketplace")).Font(FCoreStyle::GetDefaultFontStyle("Bold", 10)) ]
	+ SVerticalBox::Slot().AutoHeight().Padding(0, 2)
	[
		SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().FillWidth(1.f)
		[
			SNew(SEditableTextBox)
			.HintText(LOCTEXT("SearchHint", "Search query"))
			.OnTextCommitted_Lambda([this](const FText& Text, ETextCommit::Type) { SearchQuery = Text.ToString(); })
		]
		+ SHorizontalBox::Slot().AutoWidth().Padding(6, 0, 0, 0) [ SNew(SButton).Text(LOCTEXT("Search", "Search")).OnClicked(this, &SGameWorldEditorPanel::OnSearchClicked) ]
	]
	+ SVerticalBox::Slot().AutoHeight().Padding(0, 6)
	[
		SAssignNew(ResultsBox, SVerticalBox)
	];
}

TSharedRef<SWidget> SGameWorldEditorPanel::BuildPublishSection()
{
	return SNew(SVerticalBox)
	+ SVerticalBox::Slot().AutoHeight().Padding(0, 2) [ SNew(STextBlock).Text(LOCTEXT("Publish", "Publish open level's world")).Font(FCoreStyle::GetDefaultFontStyle("Bold", 10)) ]
	+ SVerticalBox::Slot().AutoHeight().Padding(0, 4)
	[
		SNew(STextBlock).Text(LOCTEXT("PublishHint", "Pushes the FGwWorldDocument on the first AGameWorldWorldActor found in the currently open level back to the server."))
		.AutoWrapText(true)
	]
	+ SVerticalBox::Slot().AutoHeight().Padding(0, 4)
	[
		SNew(SButton).Text(LOCTEXT("PublishButton", "Push document to server")).OnClicked(this, &SGameWorldEditorPanel::OnPublishClicked)
	];
}

void SGameWorldEditorPanel::RebuildResults()
{
	if (!ResultsBox.IsValid()) return;
	ResultsBox->ClearChildren();

	for (const FGwProductSummary& Product : SearchResults)
	{
		ResultsBox->AddSlot().AutoHeight().Padding(0, 2)
		[
			SNew(SBorder)
			.Padding(6)
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight() [ SNew(STextBlock).Text(FText::FromString(Product.Title)) ]
					+ SVerticalBox::Slot().AutoHeight()
					[
						SNew(STextBlock).Text(FText::FromString(FString::Printf(TEXT("%s - $%.2f - %.1f (%d)"),
							*Product.Category, Product.PriceCents / 100.f, Product.RatingAverage, Product.RatingCount)))
					]
				]
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
				[
					SNew(SButton)
					.Text(LOCTEXT("Import", "Import into level"))
					.OnClicked(this, &SGameWorldEditorPanel::OnImportClicked, Product)
				]
			]
		];
	}
}

void SGameWorldEditorPanel::SetStatus(const FString& Text)
{
	StatusText = Text;
	if (StatusBlock.IsValid()) StatusBlock->SetText(FText::FromString(StatusText));
}

void SGameWorldEditorPanel::SendJsonRequest(const FString& Verb, const FString& Path, const TSharedPtr<FJsonObject>& Body, FJsonSuccess OnSuccess, FJsonFailure OnError)
{
	FString Base = BaseUrl;
	Base.RemoveFromEnd(TEXT("/"));
	const FString Url = Base + TEXT("/v1") + (Path.StartsWith(TEXT("/")) ? Path : TEXT("/") + Path);

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(Url);
	Request->SetVerb(Verb);
	Request->SetHeader(TEXT("Accept"), TEXT("application/json"));
	Request->SetHeader(TEXT("X-GameWorld-SDK"), TEXT("unreal-editor/1.0.0"));

	if (!Jwt.IsEmpty()) Request->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *Jwt));
	else if (!ApiKey.IsEmpty()) Request->SetHeader(TEXT("x-api-key"), ApiKey);

	if (Body.IsValid())
	{
		Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
		Request->SetContentAsString(FGameWorldJson::ObjectToString(Body));
	}

	Request->OnProcessRequestComplete().BindLambda(
		[OnSuccess, OnError](FHttpRequestPtr, FHttpResponsePtr Response, bool bConnectedSuccessfully)
		{
			const int32 Status = Response.IsValid() ? Response->GetResponseCode() : 0;
			if (!bConnectedSuccessfully || Status < 200 || Status >= 300)
			{
				FString Message = FString::Printf(TEXT("Request failed with status %d."), Status);
				if (Response.IsValid())
				{
					if (TSharedPtr<FJsonObject> Envelope = FGameWorldJson::StringToObject(Response->GetContentAsString()))
					{
						const TSharedPtr<FJsonObject>* ErrorObj;
						if (Envelope->TryGetObjectField(TEXT("error"), ErrorObj))
						{
							Message = FGameWorldJson::GetString(*ErrorObj, TEXT("message"), Message);
						}
					}
				}
				if (OnError) OnError(Message);
				return;
			}

			const FString Content = Response->GetContentAsString();
			TSharedPtr<FJsonObject> Result = Content.IsEmpty() ? MakeShared<FJsonObject>() : FGameWorldJson::StringToObject(Content);
			if (!Result.IsValid()) { if (OnError) OnError(TEXT("Failed to parse response JSON.")); return; }
			if (OnSuccess) OnSuccess(Result);
		});

	Request->ProcessRequest();
}

FReply SGameWorldEditorPanel::OnSignInClicked()
{
	auto Body = MakeShared<FJsonObject>();
	Body->SetStringField(TEXT("email"), Email);

	SetStatus(TEXT("Signing in..."));
	SendJsonRequest(TEXT("POST"), TEXT("/auth/dev"), Body,
		[this](TSharedPtr<FJsonObject> Response)
		{
			Jwt = FGameWorldJson::GetString(Response, TEXT("token"));
			FString DisplayName, Tier;
			const TSharedPtr<FJsonObject>* UserObj;
			if (Response->TryGetObjectField(TEXT("user"), UserObj))
			{
				DisplayName = FGameWorldJson::GetString(*UserObj, TEXT("displayName"));
				Tier = FGameWorldJson::GetString(*UserObj, TEXT("tier"));
			}
			SetStatus(FString::Printf(TEXT("Signed in as %s (%s)."), *DisplayName, *Tier));
		},
		[this](const FString& Error) { SetStatus(TEXT("Login failed: ") + Error); });

	return FReply::Handled();
}

FReply SGameWorldEditorPanel::OnUseApiKeyClicked()
{
	Jwt.Empty();
	SetStatus(ApiKey.IsEmpty() ? TEXT("API key cleared.") : TEXT("API key set. Requests will authenticate with x-api-key."));
	return FReply::Handled();
}

FReply SGameWorldEditorPanel::OnSignOutClicked()
{
	Jwt.Empty();
	ApiKey.Empty();
	SetStatus(TEXT("Signed out."));
	return FReply::Handled();
}

FReply SGameWorldEditorPanel::OnSearchClicked()
{
	FString Path = TEXT("/marketplace/search?limit=20");
	if (!SearchQuery.IsEmpty()) Path += TEXT("&q=") + SearchQuery;
	if (!SearchCategory.IsEmpty()) Path += TEXT("&category=") + SearchCategory;

	SetStatus(TEXT("Searching..."));
	SendJsonRequest(TEXT("GET"), Path, nullptr,
		[this](TSharedPtr<FJsonObject> Response)
		{
			SearchResults.Reset();
			const TArray<TSharedPtr<FJsonValue>>* Items;
			if (Response->TryGetArrayField(TEXT("items"), Items))
			{
				for (const auto& Item : *Items) SearchResults.Add(FGameWorldJson::ParseProductSummary(Item->AsObject()));
			}
			SetStatus(FString::Printf(TEXT("Found %d product(s)."), SearchResults.Num()));
			RebuildResults();
		},
		[this](const FString& Error) { SetStatus(TEXT("Search failed: ") + Error); });

	return FReply::Handled();
}

FReply SGameWorldEditorPanel::OnImportClicked(FGwProductSummary Product)
{
	if (Product.Category != TEXT("WORLD"))
	{
		SetStatus(FString::Printf(TEXT("Import currently supports WORLD products only (got %s)."), *Product.Category));
		return FReply::Handled();
	}
	if (!GEditor)
	{
		SetStatus(TEXT("No editor world available."));
		return FReply::Handled();
	}

	SetStatus(TEXT("Fetching product..."));
	SendJsonRequest(TEXT("GET"), TEXT("/products/") + Product.Id, nullptr,
		[this](TSharedPtr<FJsonObject> ProductResponse)
		{
			const FString WorldId = FGameWorldJson::GetString(ProductResponse, TEXT("id"));
			SendJsonRequest(TEXT("GET"), FString::Printf(TEXT("/worlds/%s/document"), *WorldId), nullptr,
				[this](TSharedPtr<FJsonObject> DocResponse)
				{
					const FGwWorldDocument Document = FGameWorldJson::ParseWorldDocument(DocResponse);
					UGameWorldLoader* Loader = UGameWorldLoader::Create(GetTransientPackage(), nullptr);
					if (UWorld* EditorWorld = GEditor->GetEditorWorldContext().World())
					{
						AGameWorldWorldActor* WorldActor = Loader->SpawnDocument(EditorWorld, Document);
						SetStatus(WorldActor
							? FString::Printf(TEXT("Imported '%s' (%d entities)."), *Document.Name, Document.Entities.Num())
							: TEXT("Import failed: could not spawn the world actor."));
					}
				},
				[this](const FString& Error) { SetStatus(TEXT("Import failed: ") + Error); });
		},
		[this](const FString& Error) { SetStatus(TEXT("Import failed: ") + Error); });

	return FReply::Handled();
}

FReply SGameWorldEditorPanel::OnPublishClicked()
{
	if (!GEditor)
	{
		SetStatus(TEXT("No editor world available."));
		return FReply::Handled();
	}

	UWorld* EditorWorld = GEditor->GetEditorWorldContext().World();
	AGameWorldWorldActor* WorldActor = nullptr;
	if (EditorWorld)
	{
		for (TActorIterator<AGameWorldWorldActor> It(EditorWorld); It; ++It)
		{
			WorldActor = *It;
			break;
		}
	}

	if (!WorldActor)
	{
		SetStatus(TEXT("No AGameWorldWorldActor found in the open level. Import a world via the Marketplace section first."));
		return FReply::Handled();
	}

	SetStatus(TEXT("Publishing..."));
	TSharedPtr<FJsonObject> Body = FGameWorldJson::Serialize(WorldActor->Document);
	SendJsonRequest(TEXT("PUT"), FString::Printf(TEXT("/worlds/%s/document"), *WorldActor->Document.Id), Body,
		[this](TSharedPtr<FJsonObject>) { SetStatus(TEXT("Published.")); },
		[this](const FString& Error) { SetStatus(TEXT("Publish failed: ") + Error); });

	return FReply::Handled();
}

#undef LOCTEXT_NAMESPACE
