#include "GameWorldTypes.h"

FString FGwEnums::ToString(EGwEntityKind Kind)
{
	switch (Kind)
	{
	case EGwEntityKind::Region: return TEXT("REGION");
	case EGwEntityKind::Zone: return TEXT("ZONE");
	case EGwEntityKind::Building: return TEXT("BUILDING");
	case EGwEntityKind::Room: return TEXT("ROOM");
	case EGwEntityKind::Npc: return TEXT("NPC");
	case EGwEntityKind::PlayerSpawn: return TEXT("PLAYER_SPAWN");
	case EGwEntityKind::Item: return TEXT("ITEM");
	case EGwEntityKind::Vehicle: return TEXT("VEHICLE");
	case EGwEntityKind::Trigger: return TEXT("TRIGGER");
	case EGwEntityKind::Camera: return TEXT("CAMERA");
	case EGwEntityKind::Light: return TEXT("LIGHT");
	case EGwEntityKind::Prop: return TEXT("PROP");
	case EGwEntityKind::Terrain: return TEXT("TERRAIN");
	case EGwEntityKind::Water: return TEXT("WATER");
	case EGwEntityKind::Road: return TEXT("ROAD");
	case EGwEntityKind::Volume: return TEXT("VOLUME");
	case EGwEntityKind::Group: return TEXT("GROUP");
	default: return TEXT("PROP");
	}
}

EGwEntityKind FGwEnums::EntityKindFromString(const FString& Value)
{
	if (Value == TEXT("REGION")) return EGwEntityKind::Region;
	if (Value == TEXT("ZONE")) return EGwEntityKind::Zone;
	if (Value == TEXT("BUILDING")) return EGwEntityKind::Building;
	if (Value == TEXT("ROOM")) return EGwEntityKind::Room;
	if (Value == TEXT("NPC")) return EGwEntityKind::Npc;
	if (Value == TEXT("PLAYER_SPAWN")) return EGwEntityKind::PlayerSpawn;
	if (Value == TEXT("ITEM")) return EGwEntityKind::Item;
	if (Value == TEXT("VEHICLE")) return EGwEntityKind::Vehicle;
	if (Value == TEXT("TRIGGER")) return EGwEntityKind::Trigger;
	if (Value == TEXT("CAMERA")) return EGwEntityKind::Camera;
	if (Value == TEXT("LIGHT")) return EGwEntityKind::Light;
	if (Value == TEXT("PROP")) return EGwEntityKind::Prop;
	if (Value == TEXT("TERRAIN")) return EGwEntityKind::Terrain;
	if (Value == TEXT("WATER")) return EGwEntityKind::Water;
	if (Value == TEXT("ROAD")) return EGwEntityKind::Road;
	if (Value == TEXT("VOLUME")) return EGwEntityKind::Volume;
	if (Value == TEXT("GROUP")) return EGwEntityKind::Group;
	return EGwEntityKind::Prop;
}

FString FGwEnums::ToString(EGwVisibility Value)
{
	switch (Value)
	{
	case EGwVisibility::Private: return TEXT("PRIVATE");
	case EGwVisibility::Team: return TEXT("TEAM");
	case EGwVisibility::Public: return TEXT("PUBLIC");
	default: return TEXT("PRIVATE");
	}
}

FString FGwEnums::ToString(EGwWeather Value)
{
	switch (Value)
	{
	case EGwWeather::Clear: return TEXT("CLEAR");
	case EGwWeather::Clouds: return TEXT("CLOUDS");
	case EGwWeather::Rain: return TEXT("RAIN");
	case EGwWeather::Storm: return TEXT("STORM");
	case EGwWeather::Snow: return TEXT("SNOW");
	case EGwWeather::Fog: return TEXT("FOG");
	case EGwWeather::Sandstorm: return TEXT("SANDSTORM");
	default: return TEXT("CLEAR");
	}
}

EGwWeather FGwEnums::WeatherFromString(const FString& Value)
{
	if (Value == TEXT("CLOUDS")) return EGwWeather::Clouds;
	if (Value == TEXT("RAIN")) return EGwWeather::Rain;
	if (Value == TEXT("STORM")) return EGwWeather::Storm;
	if (Value == TEXT("SNOW")) return EGwWeather::Snow;
	if (Value == TEXT("FOG")) return EGwWeather::Fog;
	if (Value == TEXT("SANDSTORM")) return EGwWeather::Sandstorm;
	return EGwWeather::Clear;
}

FString FGwEnums::ToString(EGwCameraMode Value)
{
	switch (Value)
	{
	case EGwCameraMode::Orbit: return TEXT("ORBIT");
	case EGwCameraMode::Follow: return TEXT("FOLLOW");
	case EGwCameraMode::Chase: return TEXT("CHASE");
	case EGwCameraMode::Drone: return TEXT("DRONE");
	case EGwCameraMode::FirstPerson: return TEXT("FIRST_PERSON");
	case EGwCameraMode::ThirdPerson: return TEXT("THIRD_PERSON");
	case EGwCameraMode::Rail: return TEXT("RAIL");
	case EGwCameraMode::Crane: return TEXT("CRANE");
	case EGwCameraMode::AiDirector: return TEXT("AI_DIRECTOR");
	default: return TEXT("ORBIT");
	}
}

EGwCameraMode FGwEnums::CameraModeFromString(const FString& Value)
{
	if (Value == TEXT("FOLLOW")) return EGwCameraMode::Follow;
	if (Value == TEXT("CHASE")) return EGwCameraMode::Chase;
	if (Value == TEXT("DRONE")) return EGwCameraMode::Drone;
	if (Value == TEXT("FIRST_PERSON")) return EGwCameraMode::FirstPerson;
	if (Value == TEXT("THIRD_PERSON")) return EGwCameraMode::ThirdPerson;
	if (Value == TEXT("RAIL")) return EGwCameraMode::Rail;
	if (Value == TEXT("CRANE")) return EGwCameraMode::Crane;
	if (Value == TEXT("AI_DIRECTOR")) return EGwCameraMode::AiDirector;
	return EGwCameraMode::Orbit;
}

FString FGwEnums::ToString(EGwProductCategory Value)
{
	switch (Value)
	{
	case EGwProductCategory::World: return TEXT("WORLD");
	case EGwProductCategory::GameKit: return TEXT("GAME_KIT");
	case EGwProductCategory::System: return TEXT("SYSTEM");
	case EGwProductCategory::AiAgent: return TEXT("AI_AGENT");
	case EGwProductCategory::Character: return TEXT("CHARACTER");
	case EGwProductCategory::Vehicle: return TEXT("VEHICLE");
	case EGwProductCategory::Environment: return TEXT("ENVIRONMENT");
	case EGwProductCategory::Cinematic: return TEXT("CINEMATIC");
	case EGwProductCategory::Mission: return TEXT("MISSION");
	case EGwProductCategory::Experience: return TEXT("EXPERIENCE");
	default: return TEXT("WORLD");
	}
}

FString FGwEnums::ToString(EGwLicenseCompatibility Value)
{
	switch (Value)
	{
	case EGwLicenseCompatibility::Green: return TEXT("GREEN");
	case EGwLicenseCompatibility::Yellow: return TEXT("YELLOW");
	case EGwLicenseCompatibility::Red: return TEXT("RED");
	default: return TEXT("GREEN");
	}
}

EGwLicenseCompatibility FGwEnums::LicenseCompatibilityFromString(const FString& Value)
{
	if (Value == TEXT("YELLOW")) return EGwLicenseCompatibility::Yellow;
	if (Value == TEXT("RED")) return EGwLicenseCompatibility::Red;
	return EGwLicenseCompatibility::Green;
}
