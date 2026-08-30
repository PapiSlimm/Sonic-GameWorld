#include "SonicGameWorldEditorModule.h"
#include "SGameWorldEditorPanel.h"
#include "Widgets/Docking/SDockTab.h"
#include "Widgets/SBoxPanel.h"
#include "WorkspaceMenuStructure.h"
#include "WorkspaceMenuStructureModule.h"
#include "ToolMenus.h"

#define LOCTEXT_NAMESPACE "FSonicGameWorldEditorModule"

const FName FSonicGameWorldEditorModule::DashboardTabName(TEXT("SonicGameWorldDashboard"));

void FSonicGameWorldEditorModule::StartupModule()
{
	FGlobalTabmanager::Get()->RegisterNomadTabSpawner(
		DashboardTabName,
		FOnSpawnTab::CreateRaw(this, &FSonicGameWorldEditorModule::SpawnDashboardTab))
		.SetDisplayName(NSLOCTEXT("SonicGameWorld", "DashboardTabTitle", "Sonic GameWorld"))
		.SetTooltipText(NSLOCTEXT("SonicGameWorld", "DashboardTabTooltip", "Sign in, browse the GameWorld Marketplace, and publish worlds."))
		.SetGroup(WorkspaceMenu::GetMenuStructure().GetToolsCategory())
		.SetIcon(FSlateIcon(FName("EditorStyle"), "LevelEditor.Tabs.Details"));

	if (UToolMenus::IsToolMenuUIEnabled())
	{
		UToolMenus::RegisterStartupCallback(FSimpleMulticastDelegate::FDelegate::CreateRaw(this, &FSonicGameWorldEditorModule::RegisterMenus));
	}
}

void FSonicGameWorldEditorModule::ShutdownModule()
{
	if (FSlateApplication::IsInitialized())
	{
		FGlobalTabmanager::Get()->UnregisterNomadTabSpawner(DashboardTabName);
	}
	UToolMenus::UnRegisterStartupCallback(this);
	UToolMenus::UnregisterOwner(this);
}

void FSonicGameWorldEditorModule::RegisterMenus()
{
	FToolMenuOwnerScoped OwnerScoped(this);
	if (UToolMenu* Menu = UToolMenus::Get()->ExtendMenu("LevelEditor.MainMenu.Window"))
	{
		FToolMenuSection& Section = Menu->FindOrAddSection("SonicGameWorld");
		Section.Label = NSLOCTEXT("SonicGameWorld", "MenuSection", "Sonic GameWorld");
		Section.AddMenuEntry(
			"OpenSonicGameWorldDashboard",
			NSLOCTEXT("SonicGameWorld", "OpenDashboard", "GameWorld Dashboard"),
			NSLOCTEXT("SonicGameWorld", "OpenDashboardTooltip", "Sign in, browse the GameWorld Marketplace, and publish worlds."),
			FSlateIcon(),
			FUIAction(FExecuteAction::CreateLambda([]()
			{
				FGlobalTabmanager::Get()->TryInvokeTab(FSonicGameWorldEditorModule::DashboardTabName);
			})));
	}
}

TSharedRef<SDockTab> FSonicGameWorldEditorModule::SpawnDashboardTab(const FSpawnTabArgs& Args)
{
	return SNew(SDockTab)
		.TabRole(ETabRole::NomadTab)
		[
			SNew(SGameWorldEditorPanel)
		];
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FSonicGameWorldEditorModule, SonicGameWorldEditor)
