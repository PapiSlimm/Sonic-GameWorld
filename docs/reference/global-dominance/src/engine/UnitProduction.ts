import { useGameStore } from '../store/gameStore';
import { UNIT_STATS, CELL_SIZE } from '../constants';
import { Faction, Unit, UnitState } from '../types';

interface QueueItem {
  type: 'Infantry' | 'Armored' | 'Air';
  faction: Faction;
  startTime: number;
  duration: number;
}

export class UnitProduction {
  private static queue: QueueItem[] = [];

  static update(time: number) {
    const finished: QueueItem[] = [];
    const remaining: QueueItem[] = [];
    const uiQueue: { id: string; type: 'Infantry' | 'Armored' | 'Air'; faction: Faction; progress: number }[] = [];

    this.queue.forEach(item => {
      const elapsed = time - item.startTime;
      if (elapsed >= item.duration) {
        finished.push(item);
      } else {
        remaining.push(item);
        uiQueue.push({
          id: `${item.faction}-${item.type}-${item.startTime}`,
          type: item.type,
          faction: item.faction,
          progress: (elapsed / item.duration) * 100
        });
      }
    });

    this.queue = remaining;
    useGameStore.setState({ productionQueue: uiQueue });

    finished.forEach(item => {
      this.spawnUnit(item.type, item.faction);
      if (item.faction === useGameStore.getState().input.selectedFaction) {
        useGameStore.getState().addNotification(`${item.type.toUpperCase()} deployed.`, 'info');
      }
    });
  }

  static addToQueue(type: 'Infantry' | 'Armored' | 'Air', faction: Faction, time: number) {
    const stats = UNIT_STATS[type];
    const state = useGameStore.getState();
    
    if (state.economy[faction].credits < stats.cost) {
      if (faction === state.input.selectedFaction) {
        state.addNotification(`Insufficient Credits to build ${type}.`, 'danger');
      }
      return;
    }

    useGameStore.getState().addCredits(faction, -stats.cost);
    
    this.queue.push({
      type,
      faction,
      startTime: time,
      duration: 3500, // 3.5 seconds build time
    });
  }

  private static spawnUnit(type: 'Infantry' | 'Armored' | 'Air', faction: Faction) {
    const stats = UNIT_STATS[type];
    const state = useGameStore.getState();
    
    const factory = state.entities.buildings.find(b => 
      b.faction === faction && 
      (type === 'Infantry' ? b.class === 'Barracks' : b.class === 'Factory' || b.class === 'Airfield')
    ) || state.entities.buildings.find(b => b.faction === faction);

    if (!factory) return;

    const newUnit: Unit = {
      id: Math.random().toString(36).substring(2, 9),
      faction,
      class: type,
      state: UnitState.Idle,
      transform: { 
        x: factory.position.x * CELL_SIZE + 40, 
        y: factory.position.y * CELL_SIZE + 40,
        rotation: 0
      },
      velocity: { x: 0, y: 0 },
      path: [],
      health: stats.health,
      maxHealth: stats.health,
      speed: stats.speed,
      attackRange: stats.attackRange,
      damage: stats.damage,
      detectionRadius: stats.detectionRadius,
      commands: [],
      targetNodeId: null,
      lastFired: 0,
      harvestedSotolium: 0,
      heat: 0,
      visibility: 1.0,
      isDetected: true,
      isSelected: false,
    };

    useGameStore.getState().updateUnits(units => {
      units.push(newUnit);
    });
  }

  static getQueue() { return this.queue; }
}
