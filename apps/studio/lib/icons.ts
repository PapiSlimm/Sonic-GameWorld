import type { EntityKind } from '@sonic-gameworld/world-schema';
import {
  Bot,
  Box,
  Building2,
  Camera,
  Car,
  DoorOpen,
  Flag,
  Group,
  Lightbulb,
  type LucideIcon,
  Map,
  Package,
  Route,
  Shield,
  Sparkles,
  Swords,
  Trees,
  Waves,
  Zap,
} from 'lucide-react';

/** Maps a world entity kind to the lucide icon used across the scene tree, HUD and pickers. */
export const ENTITY_KIND_ICONS: Record<EntityKind, LucideIcon> = {
  REGION: Map,
  ZONE: Trees,
  BUILDING: Building2,
  ROOM: DoorOpen,
  NPC: Bot,
  PLAYER_SPAWN: Flag,
  ITEM: Package,
  VEHICLE: Car,
  TRIGGER: Zap,
  CAMERA: Camera,
  LIGHT: Lightbulb,
  PROP: Box,
  TERRAIN: Trees,
  WATER: Waves,
  ROAD: Route,
  VOLUME: Sparkles,
  GROUP: Group,
  RTS_UNIT: Swords,
  RTS_BUILDING: Shield,
};

export function entityKindIcon(kind: EntityKind): LucideIcon {
  return ENTITY_KIND_ICONS[kind] ?? Box;
}
