import { useGameStore } from '../store/gameStore';
import { spatialGrid } from './SpatialGrid';
import { Steering } from './Steering';
import { Pathfinding } from '../utils/pathfinding';
import { UNIT_STATS, COOLING_RATE, SOTOLIUM_CONVERSION_RATE, CELL_SIZE, GRID_WIDTH, GRID_HEIGHT } from '../constants';
import { Unit, Projectile, Faction, UnitState } from '../types';

const generateId = () => Math.random().toString(36).substring(2, 9);

const distance = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

export class GameEngine {
  private static lastTime: number = 0;

  static update(time: number) {
    // Standardize deltaTime
    if (this.lastTime === 0) {
      this.lastTime = time;
      return;
    }
    const deltaTime = Math.min((time - this.lastTime) / 1000, 0.1); // Cap spike
    this.lastTime = time;
    
    const state = useGameStore.getState();
    if (state.winner || state.input.view !== 'Game') return;

    // 1. Rebuild Spatial Grid Partition
    spatialGrid.clear();
    state.entities.units.forEach(u => {
      if (u.state !== UnitState.Dead) {
        spatialGrid.insert(u.id, u.transform.x, u.transform.y);
      }
    });

    // 2. Run systems sequentially
    this.commandSystem(deltaTime, state);
    this.movementSystem(deltaTime, state);
    this.combatSystem(deltaTime, time, state);
    this.projectileSystem(deltaTime, state);
    this.harvestingSystem(deltaTime, state);
    this.fogOfWarSystem(state);
    this.victorySystem(state);
    
    // Increment session time
    useGameStore.setState({ sessionTime: state.sessionTime + deltaTime });
  }

  private static commandSystem(_deltaTime: number, state: any) {
    useGameStore.getState().updateUnits(units => {
      units.forEach(unit => {
        if (unit.state === UnitState.Dead) return;
        if (unit.commands.length === 0) {
          if (unit.state !== UnitState.Idle) {
            unit.state = UnitState.Idle;
          }
          return;
        }

        const cmd = unit.commands[0];
        
        switch (cmd.type) {
          case 'MOVE':
            if (cmd.targetPos && !unit.path) {
              unit.path = Pathfinding.findPath(
                { x: unit.transform.x, y: unit.transform.y },
                cmd.targetPos,
                state.map.occupancy,
                GRID_WIDTH,
                GRID_HEIGHT,
                CELL_SIZE
              ) || [];
              unit.state = UnitState.Moving;
            }
            break;
            
          case 'HARVEST':
            if (cmd.targetId) {
              const node = state.entities.resources.find((n: any) => n.id === cmd.targetId);
              if (node && node.amount > 0) {
                const dist = distance(unit.transform, node.position);
                if (dist > 60) {
                  if (!unit.path) {
                    unit.path = Pathfinding.findPath(
                      { x: unit.transform.x, y: unit.transform.y },
                      node.position,
                      state.map.occupancy,
                      GRID_WIDTH,
                      GRID_HEIGHT,
                      CELL_SIZE
                    ) || [];
                  }
                  unit.state = UnitState.Moving;
                } else {
                  unit.state = UnitState.Harvesting;
                  unit.targetNodeId = node.id;
                  unit.path = [];
                }
              } else {
                unit.commands.shift(); // Pop depleted node command
                unit.targetNodeId = null;
                unit.state = UnitState.Idle;
              }
            }
            break;
            
          default:
            break;
        }
      });
    });
  }

  private static movementSystem(deltaTime: number, state: any) {
    useGameStore.getState().updateUnits(units => {
      units.forEach(unit => {
        if (unit.state === UnitState.Dead) return;
        if (state.input.viewMode === 'FPS' && unit.id === state.input.controlledUnitId) return;

        let steering = { x: 0, y: 0 };
        
        // Steering - Group Separation Behavior
        const nearbyIds = spatialGrid.getNearby(unit.transform.x, unit.transform.y, 60);
        const neighbors = units.filter(u => nearbyIds.includes(u.id) && u.state !== UnitState.Dead);
        const sep = Steering.getSeparation(unit, neighbors);
        steering.x += sep.x * 60;
        steering.y += sep.y * 60;

        // Steering - Follow A* Waypoint Path
        if (unit.path && unit.path.length > 0) {
          const nextNode = unit.path[0];
          const dist = distance(unit.transform, nextNode);
          
          if (dist > 18) {
            const force = unit.path.length === 1 
              ? Steering.getArrival(unit, nextNode, 40)
              : Steering.getSeek(unit, nextNode);
            
            steering.x += force.x;
            steering.y += force.y;
          } else {
            unit.path.shift();
            
            if (unit.path.length === 0) {
              unit.path = [];
              
              // End of specific command list
              if (unit.commands.length > 0) {
                const finishedCmd = unit.commands[0];
                if (finishedCmd.type === 'MOVE') {
                  unit.commands.shift(); // Shift commands queue
                }
              }
              
              if (unit.commands.length === 0) {
                unit.state = UnitState.Idle;
              }
            }
          }
        }

        // Apply Physics
        unit.velocity.x += steering.x * deltaTime;
        unit.velocity.y += steering.y * deltaTime;
        
        // Friction drag coefficient
        unit.velocity.x *= 0.88;
        unit.velocity.y *= 0.88;

        // Position offset additions
        unit.transform.x += unit.velocity.x * deltaTime;
        unit.transform.y += unit.velocity.y * deltaTime;

        // Strict Map Boundaries Clamp
        unit.transform.x = Math.max(12, Math.min(state.map.width - 12, unit.transform.x));
        unit.transform.y = Math.max(12, Math.min(state.map.height - 12, unit.transform.y));

        if (Math.abs(unit.velocity.x) > 0.1 || Math.abs(unit.velocity.y) > 0.1) {
          unit.transform.rotation = Math.atan2(unit.velocity.y, unit.velocity.x);
        }
      });
    });
  }

  private static combatSystem(deltaTime: number, time: number, state: any) {
    useGameStore.getState().updateUnits(units => {
      units.forEach(unit => {
        if (unit.state === UnitState.Dead) return;
        if (state.input.viewMode === 'FPS' && unit.id === state.input.controlledUnitId) return;

        // Heat cooling multiplier
        unit.heat = Math.max(0, unit.heat - COOLING_RATE * deltaTime);
        
        // Combat checks
        const nearbyIds = spatialGrid.getNearby(unit.transform.x, unit.transform.y, unit.attackRange);
        let nearestEnemy: Unit | null = null;
        let minDist = unit.attackRange;

        nearbyIds.forEach(id => {
          const enemy = units.find(u => u.id === id);
          if (!enemy || enemy.faction === unit.faction || enemy.state === UnitState.Dead) return;
          const d = distance(unit.transform, enemy.transform);
          if (d < minDist) {
            minDist = d;
            nearestEnemy = enemy;
          }
        });

        if (nearestEnemy) {
          unit.state = UnitState.Attacking;
          
          if (time - unit.lastFired > 1000) {
            unit.lastFired = time;
            const classStats = UNIT_STATS[unit.class as 'Infantry' | 'Armored' | 'Air'];
            unit.heat = Math.min(1.2, unit.heat + (classStats?.heatPerShot || 0.12));
            
            // Build real projectile proxy
            useGameStore.getState().updateProjectiles(projs => {
              projs.push({
                id: generateId(),
                position: { x: unit.transform.x, y: unit.transform.y },
                targetPosition: { x: nearestEnemy!.transform.x, y: nearestEnemy!.transform.y },
                speed: 750,
                damage: unit.damage,
                ownerId: unit.id,
                faction: unit.faction
              });
            });
          }
        }
      });
    });
  }

  private static projectileSystem(deltaTime: number, _state: any) {
    useGameStore.getState().updateProjectiles(projectiles => {
      const remaining: Projectile[] = [];
      projectiles.forEach(p => {
        const dist = distance(p.position, p.targetPosition);
        if (dist < 12) {
          // Check collision impacts on unit entities
          useGameStore.getState().updateUnits(units => {
            units.forEach(u => {
              if (u.faction !== p.faction && u.state !== UnitState.Dead && distance(p.position, u.transform) < 22) {
                u.health = Math.max(0, u.health - p.damage);
                u.heat = Math.min(1.0, u.heat + 0.08);
              }
            });
          });

          // Check collision impacts on building structures
          useGameStore.getState().updateBuildings(buildings => {
            buildings.forEach(b => {
              if (b.faction !== p.faction && b.health > 0) {
                const bx = b.position.x * CELL_SIZE;
                const by = b.position.y * CELL_SIZE;
                const bw = b.size.w * CELL_SIZE;
                const bh = b.size.h * CELL_SIZE;
                if (p.position.x >= bx && p.position.x <= bx + bw && p.position.y >= by && p.position.y <= by + bh) {
                  b.health = Math.max(0, b.health - p.damage);
                }
              }
            });
          });
        } else {
          const dx = (p.targetPosition.x - p.position.x) / dist;
          const dy = (p.targetPosition.y - p.position.y) / dist;
          p.position.x += dx * p.speed * deltaTime;
          p.position.y += dy * p.speed * deltaTime;
          remaining.push(p);
        }
      });
      projectiles.length = 0;
      projectiles.push(...remaining);
    });
  }

  private static harvestingSystem(deltaTime: number, state: any) {
    const factionCredits = { [Faction.Raven]: 0, [Faction.Dragon]: 0 };
    const nodeHarvests: Record<string, number> = {};

    useGameStore.getState().updateUnits(units => {
      units.forEach(unit => {
        if (unit.state === UnitState.Harvesting && unit.targetNodeId && unit.health > 0) {
          const amount = deltaTime * 12.5;
          unit.harvestedSotolium += amount;
          nodeHarvests[unit.targetNodeId] = (nodeHarvests[unit.targetNodeId] || 0) + amount;
          
          if (unit.harvestedSotolium >= 40) {
            factionCredits[unit.faction] += Math.floor(unit.harvestedSotolium * SOTOLIUM_CONVERSION_RATE);
            unit.harvestedSotolium = 0;
          }
          
          const node = state.entities.resources.find((n: any) => n.id === unit.targetNodeId);
          if (!node || node.amount <= 0) {
            unit.state = UnitState.Idle;
            unit.targetNodeId = null;
            if (unit.commands.length > 0 && unit.commands[0].type === 'HARVEST') {
              unit.commands.shift();
            }
          }
        }
      });
    });

    Object.entries(factionCredits).forEach(([faction, amount]) => {
      if (amount > 0) {
        useGameStore.getState().addCredits(faction as Faction, amount);
      }
    });

    if (Object.keys(nodeHarvests).length > 0) {
      useGameStore.setState({
        entities: {
          ...state.entities,
          resources: state.entities.resources.map((node: any) => ({
            ...node,
            amount: Math.max(0, node.amount - (nodeHarvests[node.id] || 0)),
            isBeingHarvested: !!nodeHarvests[node.id]
          }))
        }
      });
    }
  }

  private static fogOfWarSystem(state: any) {
    const visibilityMap: Record<string, boolean> = {};
    const playerFaction = state.input.selectedFaction;

    state.entities.units.forEach((u: Unit) => {
      if (u.faction === playerFaction && u.state !== UnitState.Dead) {
        const gx = Math.floor(u.transform.x / CELL_SIZE);
        const gy = Math.floor(u.transform.y / CELL_SIZE);
        const r = Math.ceil(u.detectionRadius / CELL_SIZE);

        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            if (dx * dx + dy * dy <= r * r) {
              visibilityMap[`${gx + dx},${gy + dy}`] = true;
            }
          }
        }
      }
    });

    state.entities.buildings.forEach((b: any) => {
      if (b.faction === playerFaction && b.health > 0) {
        const r = 8;
        for (let dx = -r; dx <= r + b.size.w; dx++) {
          for (let dy = -r; dy <= r + b.size.h; dy++) {
            visibilityMap[`${b.position.x + dx},${b.position.y + dy}`] = true;
          }
        }
      }
    });

    // Detection
    useGameStore.getState().updateUnits(units => {
      units.forEach(u => {
        if (u.health <= 0 && u.state !== UnitState.Dead) {
          u.state = UnitState.Dead;
          u.velocity = { x: 0, y: 0 };
          u.path = [];
          u.commands = [];
          if (u.faction === playerFaction) {
            useGameStore.getState().addNotification(`${u.class.toUpperCase()} status: OFFLINE.`, 'danger');
          }
        }

        if (u.faction !== playerFaction) {
          const gx = Math.floor(u.transform.x / CELL_SIZE);
          const gy = Math.floor(u.transform.y / CELL_SIZE);
          u.isDetected = !!visibilityMap[`${gx},${gy}`];
        } else {
          u.isDetected = true;
        }
      });
    });

    useGameStore.setState({ map: { ...state.map, visibility: visibilityMap } });
  }

  private static victorySystem(state: any) {
    const aliveBuildings = state.entities.buildings.filter((b: any) => b.health > 0);
    const factions = new Set(aliveBuildings.map((b: any) => b.faction));
    
    if (factions.size === 1 && state.sessionTime > 15) {
      useGameStore.setState({ winner: Array.from(factions)[0] as Faction });
    }
  }
}
