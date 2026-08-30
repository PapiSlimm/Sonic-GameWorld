// Editor module for the Sonic GameWorld plugin. Registers the "Sonic GameWorld" nomad tab
// (Window > Sonic GameWorld > Dashboard) hosting SGameWorldEditorPanel — the Unreal counterpart
// of the Unity SDK's `GameWorldWindow` (Window/Sonic GameWorld/Dashboard): sign in, browse and
// import the marketplace, and publish the open level's world document back to the API.
#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

class FSonicGameWorldEditorModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;

	static const FName DashboardTabName;

private:
	TSharedRef<class SDockTab> SpawnDashboardTab(const class FSpawnTabArgs& Args);
	void RegisterMenus();
};
