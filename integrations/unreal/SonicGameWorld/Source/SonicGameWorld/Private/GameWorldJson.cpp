#include "GameWorldJson.h"
#include "Dom/JsonValue.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

FString FGameWorldJson::ObjectToString(const TSharedPtr<FJsonObject>& Object)
{
	if (!Object.IsValid()) return TEXT("{}");
	FString Out;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Out);
	FJsonSerializer::Serialize(Object.ToSharedRef(), Writer);
	return Out;
}

TSharedPtr<FJsonObject> FGameWorldJson::StringToObject(const FString& Json)
{
	TSharedPtr<FJsonObject> Result;
	if (Json.IsEmpty()) return Result;
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Json);
	FJsonSerializer::Deserialize(Reader, Result);
	return Result;
}

FString FGameWorldJson::GetString(const TSharedPtr<FJsonObject>& Object, const FString& Field, const FString& Default)
{
	if (!Object.IsValid()) return Default;
	FString Value;
	return Object->TryGetStringField(Field, Value) ? Value : Default;
}

double FGameWorldJson::GetNumber(const TSharedPtr<FJsonObject>& Object, const FString& Field, double Default)
{
	if (!Object.IsValid()) return Default;
	double Value;
	return Object->TryGetNumberField(Field, Value) ? Value : Default;
}

bool FGameWorldJson::GetBool(const TSharedPtr<FJsonObject>& Object, const FString& Field, bool Default)
{
	if (!Object.IsValid()) return Default;
	bool Value;
	return Object->TryGetBoolField(Field, Value) ? Value : Default;
}

TArray<FString> FGameWorldJson::GetStringArray(const TSharedPtr<FJsonObject>& Object, const FString& Field)
{
	TArray<FString> Out;
	if (!Object.IsValid()) return Out;
	const TArray<TSharedPtr<FJsonValue>>* Array;
	if (Object->TryGetArrayField(Field, Array))
	{
		for (const auto& Item : *Array)
		{
			FString S;
			if (Item->TryGetString(S)) Out.Add(S);
		}
	}
	return Out;
}

FGwVec3 FGameWorldJson::ParseVec3(const TSharedPtr<FJsonObject>& Object)
{
	FGwVec3 V;
	V.X = GetNumber(Object, TEXT("x"));
	V.Y = GetNumber(Object, TEXT("y"));
	V.Z = GetNumber(Object, TEXT("z"));
	return V;
}

TSharedPtr<FJsonObject> FGameWorldJson::Serialize(const FGwVec3& Value)
{
	auto Obj = MakeShared<FJsonObject>();
	Obj->SetNumberField(TEXT("x"), Value.X);
	Obj->SetNumberField(TEXT("y"), Value.Y);
	Obj->SetNumberField(TEXT("z"), Value.Z);
	return Obj;
}

FGwQuat FGameWorldJson::ParseQuat(const TSharedPtr<FJsonObject>& Object)
{
	FGwQuat Q;
	Q.X = GetNumber(Object, TEXT("x"));
	Q.Y = GetNumber(Object, TEXT("y"));
	Q.Z = GetNumber(Object, TEXT("z"));
	Q.W = GetNumber(Object, TEXT("w"), 1);
	return Q;
}

TSharedPtr<FJsonObject> FGameWorldJson::Serialize(const FGwQuat& Value)
{
	auto Obj = MakeShared<FJsonObject>();
	Obj->SetNumberField(TEXT("x"), Value.X);
	Obj->SetNumberField(TEXT("y"), Value.Y);
	Obj->SetNumberField(TEXT("z"), Value.Z);
	Obj->SetNumberField(TEXT("w"), Value.W);
	return Obj;
}

FGwTransform FGameWorldJson::ParseTransform(const TSharedPtr<FJsonObject>& Object)
{
	FGwTransform T;
	if (!Object.IsValid()) return T;
	const TSharedPtr<FJsonObject>* Pos;
	if (Object->TryGetObjectField(TEXT("position"), Pos)) T.Position = ParseVec3(*Pos);
	const TSharedPtr<FJsonObject>* Rot;
	if (Object->TryGetObjectField(TEXT("rotation"), Rot)) T.Rotation = ParseQuat(*Rot);
	const TSharedPtr<FJsonObject>* Scale;
	if (Object->TryGetObjectField(TEXT("scale"), Scale)) T.Scale = ParseVec3(*Scale);
	else T.Scale = FGwVec3{1, 1, 1};
	return T;
}

TSharedPtr<FJsonObject> FGameWorldJson::Serialize(const FGwTransform& Value)
{
	auto Obj = MakeShared<FJsonObject>();
	Obj->SetObjectField(TEXT("position"), Serialize(Value.Position));
	Obj->SetObjectField(TEXT("rotation"), Serialize(Value.Rotation));
	Obj->SetObjectField(TEXT("scale"), Serialize(Value.Scale));
	return Obj;
}

FGwGeoAnchor FGameWorldJson::ParseGeoAnchor(const TSharedPtr<FJsonObject>& Object)
{
	FGwGeoAnchor G;
	G.Lat = GetNumber(Object, TEXT("lat"));
	G.Lon = GetNumber(Object, TEXT("lon"));
	G.AltM = GetNumber(Object, TEXT("altM"));
	return G;
}

FGwAssetRef FGameWorldJson::ParseAssetRef(const TSharedPtr<FJsonObject>& Object)
{
	FGwAssetRef A;
	A.AssetId = GetString(Object, TEXT("assetId"));
	A.VersionId = GetString(Object, TEXT("versionId"));
	A.Variant = GetString(Object, TEXT("variant"));
	return A;
}

FGwEntityPermissions FGameWorldJson::ParsePermissions(const TSharedPtr<FJsonObject>& Object)
{
	FGwEntityPermissions P;
	P.OwnerId = GetString(Object, TEXT("ownerId"));
	P.Editors = GetStringArray(Object, TEXT("editors"));
	const FString Vis = GetString(Object, TEXT("visibility"), TEXT("PRIVATE"));
	P.Visibility = Vis == TEXT("PUBLIC") ? EGwVisibility::Public : (Vis == TEXT("TEAM") ? EGwVisibility::Team : EGwVisibility::Private);
	return P;
}

FGwWorldEntity FGameWorldJson::ParseWorldEntity(const TSharedPtr<FJsonObject>& Object)
{
	FGwWorldEntity E;
	if (!Object.IsValid()) return E;

	E.Id = GetString(Object, TEXT("id"));
	E.Kind = FGwEnums::EntityKindFromString(GetString(Object, TEXT("kind")));
	E.Name = GetString(Object, TEXT("name"));
	E.ParentId = GetString(Object, TEXT("parentId"));
	E.Tags = GetStringArray(Object, TEXT("tags"));

	const TSharedPtr<FJsonObject>* TransformObj;
	if (Object->TryGetObjectField(TEXT("transform"), TransformObj)) E.Transform = ParseTransform(*TransformObj);

	const TSharedPtr<FJsonObject>* GeoObj;
	if (Object->TryGetObjectField(TEXT("geo"), GeoObj))
	{
		E.bHasGeo = true;
		E.Geo = ParseGeoAnchor(*GeoObj);
	}

	const TSharedPtr<FJsonObject>* AssetRefObj;
	if (Object->TryGetObjectField(TEXT("assetRef"), AssetRefObj))
	{
		E.bHasAssetRef = true;
		E.AssetRef = ParseAssetRef(*AssetRefObj);
	}

	const TSharedPtr<FJsonObject>* AiObj;
	if (Object->TryGetObjectField(TEXT("ai"), AiObj))
	{
		E.bHasAI = true;
		E.AI.AgentId = GetString(*AiObj, TEXT("agentId"));
		E.AI.PersonalityId = GetString(*AiObj, TEXT("personalityId"));
		E.AI.bMemoryEnabled = GetBool(*AiObj, TEXT("memoryEnabled"));
	}

	const TSharedPtr<FJsonObject>* PermObj;
	if (Object->TryGetObjectField(TEXT("permissions"), PermObj)) E.Permissions = ParsePermissions(*PermObj);

	const TSharedPtr<FJsonObject>* BehaviorObj;
	if (Object->TryGetObjectField(TEXT("behavior"), BehaviorObj))
	{
		E.BehaviorSystemId = GetString(*BehaviorObj, TEXT("systemId"));
		const TSharedPtr<FJsonObject>* ParamsObj;
		if ((*BehaviorObj)->TryGetObjectField(TEXT("params"), ParamsObj)) E.BehaviorParamsJson = ObjectToString(*ParamsObj);
	}

	const TSharedPtr<FJsonObject>* MetaObj;
	if (Object->TryGetObjectField(TEXT("metadata"), MetaObj)) E.MetadataJson = ObjectToString(*MetaObj);

	return E;
}

TSharedPtr<FJsonObject> FGameWorldJson::Serialize(const FGwWorldEntity& Entity)
{
	auto Obj = MakeShared<FJsonObject>();
	Obj->SetStringField(TEXT("id"), Entity.Id);
	Obj->SetStringField(TEXT("kind"), FGwEnums::ToString(Entity.Kind));
	Obj->SetStringField(TEXT("name"), Entity.Name);
	if (!Entity.ParentId.IsEmpty()) Obj->SetStringField(TEXT("parentId"), Entity.ParentId);
	Obj->SetObjectField(TEXT("transform"), Serialize(Entity.Transform));

	TArray<TSharedPtr<FJsonValue>> TagValues;
	for (const auto& Tag : Entity.Tags) TagValues.Add(MakeShared<FJsonValueString>(Tag));
	Obj->SetArrayField(TEXT("tags"), TagValues);

	auto PermObj = MakeShared<FJsonObject>();
	PermObj->SetStringField(TEXT("ownerId"), Entity.Permissions.OwnerId);
	TArray<TSharedPtr<FJsonValue>> EditorValues;
	for (const auto& Editor : Entity.Permissions.Editors) EditorValues.Add(MakeShared<FJsonValueString>(Editor));
	PermObj->SetArrayField(TEXT("editors"), EditorValues);
	PermObj->SetStringField(TEXT("visibility"), FGwEnums::ToString(Entity.Permissions.Visibility));
	Obj->SetObjectField(TEXT("permissions"), PermObj);

	if (Entity.bHasAssetRef)
	{
		auto AssetRefObj = MakeShared<FJsonObject>();
		AssetRefObj->SetStringField(TEXT("assetId"), Entity.AssetRef.AssetId);
		if (!Entity.AssetRef.VersionId.IsEmpty()) AssetRefObj->SetStringField(TEXT("versionId"), Entity.AssetRef.VersionId);
		if (!Entity.AssetRef.Variant.IsEmpty()) AssetRefObj->SetStringField(TEXT("variant"), Entity.AssetRef.Variant);
		Obj->SetObjectField(TEXT("assetRef"), AssetRefObj);
	}

	if (!Entity.MetadataJson.IsEmpty())
	{
		if (auto MetaObj = StringToObject(Entity.MetadataJson)) Obj->SetObjectField(TEXT("metadata"), MetaObj);
	}

	return Obj;
}

FGwWorldLayer FGameWorldJson::ParseWorldLayer(const TSharedPtr<FJsonObject>& Object)
{
	FGwWorldLayer L;
	L.Id = GetString(Object, TEXT("id"));
	L.Name = GetString(Object, TEXT("name"));
	L.Kind = GetString(Object, TEXT("kind"));
	L.bVisible = GetBool(Object, TEXT("visible"), true);
	L.bLocked = GetBool(Object, TEXT("locked"));
	L.Opacity = static_cast<float>(GetNumber(Object, TEXT("opacity"), 1.0));
	L.Order = static_cast<int32>(GetNumber(Object, TEXT("order")));
	return L;
}

FGwWorldEnvironment FGameWorldJson::ParseEnvironment(const TSharedPtr<FJsonObject>& Object)
{
	FGwWorldEnvironment E;
	E.TimeOfDay = GetNumber(Object, TEXT("timeOfDay"), 12);
	E.Weather = FGwEnums::WeatherFromString(GetString(Object, TEXT("weather"), TEXT("CLEAR")));
	E.WeatherIntensity = GetNumber(Object, TEXT("weatherIntensity"));
	E.Skybox = GetString(Object, TEXT("skybox"));
	E.Gravity = GetNumber(Object, TEXT("gravity"), -9.81);

	const TSharedPtr<FJsonObject>* FogObj;
	if (Object.IsValid() && Object->TryGetObjectField(TEXT("fog"), FogObj))
	{
		E.bHasFog = true;
		E.FogDensity = GetNumber(*FogObj, TEXT("density"));
		E.FogColor = GetString(*FogObj, TEXT("color"));
	}
	return E;
}

TSharedPtr<FJsonObject> FGameWorldJson::Serialize(const FGwWorldEnvironment& Env)
{
	auto Obj = MakeShared<FJsonObject>();
	Obj->SetNumberField(TEXT("timeOfDay"), Env.TimeOfDay);
	Obj->SetStringField(TEXT("weather"), FGwEnums::ToString(Env.Weather));
	Obj->SetNumberField(TEXT("weatherIntensity"), Env.WeatherIntensity);
	if (!Env.Skybox.IsEmpty()) Obj->SetStringField(TEXT("skybox"), Env.Skybox);
	Obj->SetNumberField(TEXT("gravity"), Env.Gravity);
	if (Env.bHasFog)
	{
		auto FogObj = MakeShared<FJsonObject>();
		FogObj->SetNumberField(TEXT("density"), Env.FogDensity);
		FogObj->SetStringField(TEXT("color"), Env.FogColor);
		Obj->SetObjectField(TEXT("fog"), FogObj);
	}
	return Obj;
}

FGwLicenseRecord FGameWorldJson::ParseLicenseRecord(const TSharedPtr<FJsonObject>& Object)
{
	FGwLicenseRecord L;
	if (!Object.IsValid()) return L;
	L.Id = GetString(Object, TEXT("id"));
	L.bCommercial = GetBool(Object, TEXT("commercial"));
	L.bPersonal = GetBool(Object, TEXT("personal"));
	L.bEnterprise = GetBool(Object, TEXT("enterprise"));
	L.bRedistribution = GetBool(Object, TEXT("redistribution"));
	L.bModification = GetBool(Object, TEXT("modification"));
	L.bMultiplayer = GetBool(Object, TEXT("multiplayer"));
	L.bAiTraining = GetBool(Object, TEXT("aiTraining"));
	L.bResale = GetBool(Object, TEXT("resale"));
	L.bSublicensing = GetBool(Object, TEXT("sublicensing"));
	L.bAttribution = GetBool(Object, TEXT("attribution"));
	L.AttributionText = GetString(Object, TEXT("attributionText"));
	L.Seats = static_cast<int32>(GetNumber(Object, TEXT("seats")));
	L.Spdx = GetString(Object, TEXT("spdx"));
	return L;
}

TSharedPtr<FJsonObject> FGameWorldJson::Serialize(const FGwLicenseRecord& License)
{
	auto Obj = MakeShared<FJsonObject>();
	Obj->SetStringField(TEXT("id"), License.Id);
	Obj->SetBoolField(TEXT("commercial"), License.bCommercial);
	Obj->SetBoolField(TEXT("personal"), License.bPersonal);
	Obj->SetBoolField(TEXT("enterprise"), License.bEnterprise);
	Obj->SetBoolField(TEXT("redistribution"), License.bRedistribution);
	Obj->SetBoolField(TEXT("modification"), License.bModification);
	Obj->SetBoolField(TEXT("multiplayer"), License.bMultiplayer);
	Obj->SetBoolField(TEXT("aiTraining"), License.bAiTraining);
	Obj->SetBoolField(TEXT("resale"), License.bResale);
	Obj->SetBoolField(TEXT("sublicensing"), License.bSublicensing);
	Obj->SetBoolField(TEXT("attribution"), License.bAttribution);
	if (!License.AttributionText.IsEmpty()) Obj->SetStringField(TEXT("attributionText"), License.AttributionText);
	if (License.Seats > 0) Obj->SetNumberField(TEXT("seats"), License.Seats);
	if (!License.Spdx.IsEmpty()) Obj->SetStringField(TEXT("spdx"), License.Spdx);
	return Obj;
}

FGwAssetPassport FGameWorldJson::ParseAssetPassport(const TSharedPtr<FJsonObject>& Object)
{
	FGwAssetPassport P;
	if (!Object.IsValid()) return P;
	P.AssetId = GetString(Object, TEXT("assetId"));
	P.CreatorId = GetString(Object, TEXT("creatorId"));
	P.CreatedAt = GetString(Object, TEXT("createdAt"));
	P.Version = GetString(Object, TEXT("version"));
	P.Source = GetString(Object, TEXT("source"));
	P.Dependencies = GetStringArray(Object, TEXT("dependencies"));
	P.bAiGenerated = GetBool(Object, TEXT("aiGenerated"));
	P.bAiAssisted = GetBool(Object, TEXT("aiAssisted"));
	P.bThirdPartyContent = GetBool(Object, TEXT("thirdPartyContent"));

	const TSharedPtr<FJsonObject>* LicenseObj;
	if (Object->TryGetObjectField(TEXT("license"), LicenseObj)) P.License = ParseLicenseRecord(*LicenseObj);

	return P;
}

FGwWorldDocument FGameWorldJson::ParseWorldDocument(const TSharedPtr<FJsonObject>& Object)
{
	FGwWorldDocument D;
	if (!Object.IsValid()) return D;

	D.SchemaVersion = GetString(Object, TEXT("schemaVersion"), TEXT("1.0.0"));
	D.Id = GetString(Object, TEXT("id"));
	D.Name = GetString(Object, TEXT("name"));
	D.Description = GetString(Object, TEXT("description"));
	D.Genre = GetStringArray(Object, TEXT("genre"));
	D.SizeKm2 = GetNumber(Object, TEXT("sizeKm2"), 1);
	D.MaxPlayers = static_cast<int32>(GetNumber(Object, TEXT("maxPlayers"), 16));
	D.CreatedAt = GetString(Object, TEXT("createdAt"));
	D.UpdatedAt = GetString(Object, TEXT("updatedAt"));

	const TSharedPtr<FJsonObject>* BoundsObj;
	if (Object->TryGetObjectField(TEXT("bounds"), BoundsObj))
	{
		const TSharedPtr<FJsonObject>* MinObj;
		if ((*BoundsObj)->TryGetObjectField(TEXT("min"), MinObj)) D.Bounds.Min = ParseVec3(*MinObj);
		const TSharedPtr<FJsonObject>* MaxObj;
		if ((*BoundsObj)->TryGetObjectField(TEXT("max"), MaxObj)) D.Bounds.Max = ParseVec3(*MaxObj);
	}

	const TArray<TSharedPtr<FJsonValue>>* LayersArray;
	if (Object->TryGetArrayField(TEXT("layers"), LayersArray))
	{
		for (const auto& Item : *LayersArray) D.Layers.Add(ParseWorldLayer(Item->AsObject()));
	}

	const TArray<TSharedPtr<FJsonValue>>* EntitiesArray;
	if (Object->TryGetArrayField(TEXT("entities"), EntitiesArray))
	{
		for (const auto& Item : *EntitiesArray) D.Entities.Add(ParseWorldEntity(Item->AsObject()));
	}

	const TSharedPtr<FJsonObject>* EnvObj;
	if (Object->TryGetObjectField(TEXT("environment"), EnvObj)) D.Environment = ParseEnvironment(*EnvObj);

	const TSharedPtr<FJsonObject>* PassportObj;
	if (Object->TryGetObjectField(TEXT("passport"), PassportObj)) D.Passport = ParseAssetPassport(*PassportObj);

	const TArray<TSharedPtr<FJsonValue>>* MissionsArray;
	if (Object->TryGetArrayField(TEXT("missions"), MissionsArray))
	{
		FString Out;
		const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Out);
		FJsonSerializer::Serialize(*MissionsArray, TEXT(""), Writer, false);
		D.MissionsJson = Out;
	}
	const TArray<TSharedPtr<FJsonValue>>* CamerasArray;
	if (Object->TryGetArrayField(TEXT("cameras"), CamerasArray))
	{
		FString Out;
		const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Out);
		FJsonSerializer::Serialize(*CamerasArray, TEXT(""), Writer, false);
		D.CamerasJson = Out;
	}
	const TArray<TSharedPtr<FJsonValue>>* SystemsArray;
	if (Object->TryGetArrayField(TEXT("systems"), SystemsArray))
	{
		FString Out;
		const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Out);
		FJsonSerializer::Serialize(*SystemsArray, TEXT(""), Writer, false);
		D.SystemsJson = Out;
	}

	return D;
}

TSharedPtr<FJsonObject> FGameWorldJson::Serialize(const FGwWorldDocument& Document)
{
	auto Obj = MakeShared<FJsonObject>();
	Obj->SetStringField(TEXT("schemaVersion"), Document.SchemaVersion);
	Obj->SetStringField(TEXT("id"), Document.Id);
	Obj->SetStringField(TEXT("name"), Document.Name);
	Obj->SetStringField(TEXT("description"), Document.Description);

	TArray<TSharedPtr<FJsonValue>> GenreValues;
	for (const auto& G : Document.Genre) GenreValues.Add(MakeShared<FJsonValueString>(G));
	Obj->SetArrayField(TEXT("genre"), GenreValues);

	Obj->SetNumberField(TEXT("sizeKm2"), Document.SizeKm2);
	Obj->SetNumberField(TEXT("maxPlayers"), Document.MaxPlayers);

	auto BoundsObj = MakeShared<FJsonObject>();
	BoundsObj->SetObjectField(TEXT("min"), Serialize(Document.Bounds.Min));
	BoundsObj->SetObjectField(TEXT("max"), Serialize(Document.Bounds.Max));
	Obj->SetObjectField(TEXT("bounds"), BoundsObj);

	TArray<TSharedPtr<FJsonValue>> EntityValues;
	for (const auto& Entity : Document.Entities) EntityValues.Add(MakeShared<FJsonValueObject>(Serialize(Entity)));
	Obj->SetArrayField(TEXT("entities"), EntityValues);

	Obj->SetObjectField(TEXT("environment"), Serialize(Document.Environment));
	Obj->SetStringField(TEXT("createdAt"), Document.CreatedAt);
	Obj->SetStringField(TEXT("updatedAt"), Document.UpdatedAt);

	return Obj;
}

FGwProductSummary FGameWorldJson::ParseProductSummary(const TSharedPtr<FJsonObject>& Object)
{
	FGwProductSummary P;
	if (!Object.IsValid()) return P;
	P.Id = GetString(Object, TEXT("id"));
	P.Slug = GetString(Object, TEXT("slug"));
	P.Title = GetString(Object, TEXT("title"));
	P.Description = GetString(Object, TEXT("description"));
	P.Category = GetString(Object, TEXT("category"));
	P.Genre = GetStringArray(Object, TEXT("genre"));
	P.Engines = GetStringArray(Object, TEXT("engines"));
	P.PriceCents = static_cast<int32>(GetNumber(Object, TEXT("priceCents")));
	P.Currency = GetString(Object, TEXT("currency"), TEXT("USD"));
	P.CreatorId = GetString(Object, TEXT("creatorId"));
	P.CreatorHandle = GetString(Object, TEXT("creatorHandle"));
	P.RatingAverage = GetNumber(Object, TEXT("ratingAverage"));
	P.RatingCount = static_cast<int32>(GetNumber(Object, TEXT("ratingCount")));
	P.ThumbnailUrl = GetString(Object, TEXT("thumbnailUrl"));
	return P;
}

FGwMarketplaceSearchResult FGameWorldJson::ParseMarketplaceSearchResult(const TSharedPtr<FJsonObject>& Object)
{
	FGwMarketplaceSearchResult R;
	if (!Object.IsValid()) return R;
	const TArray<TSharedPtr<FJsonValue>>* Items;
	if (Object->TryGetArrayField(TEXT("items"), Items))
	{
		for (const auto& Item : *Items) R.Items.Add(ParseProductSummary(Item->AsObject()));
	}
	R.NextCursor = GetString(Object, TEXT("nextCursor"));
	R.Total = static_cast<int32>(GetNumber(Object, TEXT("total")));
	return R;
}

FGwAuthUser FGameWorldJson::ParseAuthUser(const TSharedPtr<FJsonObject>& Object)
{
	FGwAuthUser U;
	if (!Object.IsValid()) return U;
	U.Id = GetString(Object, TEXT("id"));
	U.Email = GetString(Object, TEXT("email"));
	U.DisplayName = GetString(Object, TEXT("displayName"));
	U.Tier = GetString(Object, TEXT("tier"));
	U.Roles = GetStringArray(Object, TEXT("roles"));
	U.OrgId = GetString(Object, TEXT("orgId"));
	return U;
}

FGwToolExecution FGameWorldJson::ParseToolExecution(const TSharedPtr<FJsonObject>& Object)
{
	FGwToolExecution T;
	if (!Object.IsValid()) return T;
	T.Id = GetString(Object, TEXT("id"));
	T.Tool = GetString(Object, TEXT("tool"));
	T.bOk = GetBool(Object, TEXT("ok"));
	T.ExecutedAt = GetString(Object, TEXT("executedAt"));

	const TSharedPtr<FJsonObject>* ArgsObj;
	if (Object->TryGetObjectField(TEXT("args"), ArgsObj)) T.ArgsJson = ObjectToString(*ArgsObj);

	if (Object->HasField(TEXT("result")))
	{
		const TSharedPtr<FJsonObject>* ResultObj;
		if (Object->TryGetObjectField(TEXT("result"), ResultObj)) T.ResultJson = ObjectToString(*ResultObj);
	}

	return T;
}

FGwAICommandResponse FGameWorldJson::ParseAICommandResponse(const TSharedPtr<FJsonObject>& Object)
{
	FGwAICommandResponse R;
	if (!Object.IsValid()) return R;
	R.Narration = GetString(Object, TEXT("narration"));

	const TArray<TSharedPtr<FJsonValue>>* ExecutedArray;
	if (Object->TryGetArrayField(TEXT("executed"), ExecutedArray))
	{
		for (const auto& Item : *ExecutedArray) R.Executed.Add(ParseToolExecution(Item->AsObject()));
	}

	const TArray<TSharedPtr<FJsonValue>>* PlanArray;
	if (Object->TryGetArrayField(TEXT("plan"), PlanArray))
	{
		FString Out;
		const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Out);
		FJsonSerializer::Serialize(*PlanArray, TEXT(""), Writer, false);
		R.PlanJson = Out;
	}
	const TArray<TSharedPtr<FJsonValue>>* DeniedArray;
	if (Object->TryGetArrayField(TEXT("denied"), DeniedArray))
	{
		FString Out;
		const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Out);
		FJsonSerializer::Serialize(*DeniedArray, TEXT(""), Writer, false);
		R.DeniedJson = Out;
	}

	return R;
}

FGwLeaderboardEntry FGameWorldJson::ParseLeaderboardEntry(const TSharedPtr<FJsonObject>& Object)
{
	FGwLeaderboardEntry E;
	if (!Object.IsValid()) return E;
	E.PlayerId = GetString(Object, TEXT("playerId"));
	E.DisplayName = GetString(Object, TEXT("displayName"));
	E.Score = GetNumber(Object, TEXT("score"));
	E.Rank = static_cast<int32>(GetNumber(Object, TEXT("rank")));
	return E;
}

FGwGameSession FGameWorldJson::ParseGameSession(const TSharedPtr<FJsonObject>& Object)
{
	FGwGameSession S;
	if (!Object.IsValid()) return S;
	S.Id = GetString(Object, TEXT("id"));
	S.GameId = GetString(Object, TEXT("gameId"));
	S.Status = GetString(Object, TEXT("status"));
	S.PlayerIds = GetStringArray(Object, TEXT("playerIds"));
	return S;
}
