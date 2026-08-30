using UnrealBuildTool;

public class SonicGameWorldEditor : ModuleRules
{
	public SonicGameWorldEditor(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"SonicGameWorld",
		});

		PrivateDependencyModuleNames.AddRange(new[]
		{
			"Slate",
			"SlateCore",
			"UnrealEd",
			"EditorStyle",
			"WorkspaceMenuStructure",
			"InputCore",
			"ToolMenus",
			"Projects",
		});
	}
}
