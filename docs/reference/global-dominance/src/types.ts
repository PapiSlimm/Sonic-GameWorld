// 1. Enums for fixed values
export enum Faction {
  Raven = 'RavenAlliance',
  Dragon = 'UnitedDragonNations'
}

export enum UnitState {
  Idle,
  Moving,
  Attacking,
  Harvesting,
  Dead
}

// 2. Spatial Data
export interface Transform {
  x: number;
  y: number;
  rotation: number;
}

// 3. Action Queue
export interface Command {
  type: 'MOVE' | 'ATTACK' | 'HARVEST' | 'BUILD';
  targetPos?: { x: number; y: number };
  targetId?: string;
}

// 4. The Core Unit Interface
export interface Unit {
  // Identification
  readonly id: string;
  faction: Faction;
  class: 'Infantry' | 'Armored' | 'Air';
  
  // Transform & Physics
  transform: Transform;
  velocity: { x: number; y: number };
  path: { x: number; y: number }[]; // A* Waypoints
  
  // Stats
  health: number;
  maxHealth: number;
  speed: number;
  attackRange: number;
  damage: number;
  detectionRadius: number; // For tactical link/detection
  
  // State Machine
  state: UnitState;
  commands: Command[]; // Command queue
  
  // Custom RTS properties
  targetNodeId: string | null;
  lastFired: number;
  harvestedSotolium: number;
  isDetected: boolean;
  
  // Visuals & Stealth
  heat: number;      // 0.0 to 1.0 (for FPS thermal views)
  visibility: number; // 0.0 to 1.0 (for Fog of War)
  isSelected: boolean;
}

export interface Building {
  id: string;
  faction: Faction;
  class: 'Refinery' | 'Barracks' | 'Factory' | 'Airfield' | 'Radar';
  position: { x: number; y: number }; // Grid coordinate (cell index)
  size: { w: number; h: number };      // Size in tiles
  health: number;
  maxHealth: number;
  isOperational: boolean;
}

export interface SotoliumNode {
  id: string;
  position: { x: number; y: number }; // World coordinates
  amount: number;
  isBeingHarvested: boolean;
}

export interface Projectile {
  id: string;
  position: { x: number; y: number };
  targetPosition: { x: number; y: number };
  speed: number;
  damage: number;
  ownerId: string;
  faction: Faction;
}

// 5. Global Game State
export interface GameState {
  version: string;
  sessionTime: number;
  status: 'Lobby' | 'Playing' | 'Paused' | 'GameOver';
  
  // Entity Collections
  entities: {
    units: Unit[];
    buildings: Building[];
    resources: SotoliumNode[];
    projectiles: Projectile[];
  };

  // Economy
  economy: Record<Faction, { credits: number; incomeRate: number }>;

  // Meta System
  map: {
    width: number;
    height: number;
    gridSize: number;
    occupancy: Uint8Array; // High-performance bitmask for collisions
    visibility: Record<string, boolean>; // Fog of war lookup table (key: "gx,gy")
  };

  // Input State
  input: {
    mouseWorld: { x: number; y: number };
    selectionBox: { startX: number; startY: number; endX: number; endY: number } | null;
    focusedEntityId: string | null; // For FPS mode control
    selectedFaction: Faction;
    selectedFormation: 'None' | 'Line' | 'Column' | 'Wedge';
    viewMode: 'RTS' | 'FPS';
    view: 'Splash' | 'Game';
  };
  
  winner: Faction | null;
}
