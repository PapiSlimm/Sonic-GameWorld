import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { GameState, Unit, Building, Faction, Projectile } from '../types';
import { STARTING_CREDITS, GRID_WIDTH, GRID_HEIGHT, CELL_SIZE } from '../constants';

export interface ProductionItem {
  id: string;
  type: 'Infantry' | 'Armored' | 'Air';
  faction: Faction;
  progress: number;
}

export interface GameNotification {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'danger';
  time: number;
}

export type GameStoreState = GameState & {
  productionQueue: ProductionItem[];
  notifications: GameNotification[];
};

interface GameStore extends GameStoreState {
  updateUnits: (fn: (units: Unit[]) => void) => void;
  updateProjectiles: (fn: (projectiles: Projectile[]) => void) => void;
  updateBuildings: (fn: (buildings: Building[]) => void) => void;
  addCredits: (faction: Faction, amount: number) => void;
  addNotification: (message: string, type: 'info' | 'warning' | 'danger') => void;
  setGameState: (state: Partial<GameState>) => void;
  setStoreState: (state: Partial<GameStoreState>) => void;
  resetGame: () => void;
}

const initialState: GameStoreState = {
  version: '2.0.0',
  sessionTime: 0,
  status: 'Playing',
  entities: {
    units: [],
    buildings: [],
    resources: [],
    projectiles: [],
  },
  economy: {
    [Faction.Raven]: { credits: STARTING_CREDITS, incomeRate: 0 },
    [Faction.Dragon]: { credits: STARTING_CREDITS, incomeRate: 0 },
  },
  map: {
    width: 2000,
    height: 2000,
    gridSize: CELL_SIZE,
    occupancy: new Uint8Array(GRID_WIDTH * GRID_HEIGHT),
    visibility: {},
  },
  input: {
    mouseWorld: { x: 0, y: 0 },
    selectionBox: null,
    focusedEntityId: null,
    selectedFaction: Faction.Raven,
    selectedFormation: 'None',
    viewMode: 'RTS',
    view: 'Splash',
  },
  productionQueue: [],
  notifications: [],
  winner: null,
};

export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set) => ({
    ...initialState,

    updateUnits: (fn) => set((state) => {
      const newUnits = [...state.entities.units];
      fn(newUnits);
      return { entities: { ...state.entities, units: newUnits } };
    }),

    updateProjectiles: (fn) => set((state) => {
      const newProjectiles = [...state.entities.projectiles];
      fn(newProjectiles);
      return { entities: { ...state.entities, projectiles: newProjectiles } };
    }),

    updateBuildings: (fn) => set((state) => {
      const newBuildings = [...state.entities.buildings];
      fn(newBuildings);
      return { entities: { ...state.entities, buildings: newBuildings } };
    }),

    addCredits: (faction, amount) => set((state) => ({
      economy: {
        ...state.economy,
        [faction]: {
          ...state.economy[faction],
          credits: Math.max(0, state.economy[faction].credits + amount)
        }
      }
    })),

    addNotification: (message, type) => set((state) => ({
      notifications: [
        { id: Math.random().toString(36).substring(2, 9), message, type, time: Date.now() },
        ...state.notifications.slice(0, 4)
      ]
    })),

    setGameState: (s) => set((state) => ({ ...state, ...s })),
    
    setStoreState: (s) => set((state) => ({ ...state, ...s })),

    resetGame: () => set(initialState),
  }))
);
