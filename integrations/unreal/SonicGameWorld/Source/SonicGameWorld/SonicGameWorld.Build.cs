using UnrealBuildTool;

public class SonicGameWorld : ModuleRules
{
	public SonicGameWorld(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"HTTP",
			"Json",
			"JsonUtilities",
			"Sockets",
			"WebSockets",
		});

		PrivateDependencyModuleNames.AddRange(new[]
		{
			"Projects",
		});
	}
}
