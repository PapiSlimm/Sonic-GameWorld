import { useGameStore } from '../store/gameStore';
import { UnitProduction } from './UnitProduction';
import { Faction, UnitState } from '../types';

export class CommanderAI {
  private static lastThinkTime: number = 0;

  static update(time: number) {
    if (time - this.lastThinkTime < 3000) return;
    this.lastThinkTime = time;

    const state = useGameStore.getState();
    const myFaction = Faction.Dragon;
    const myUnits = state.entities.units.filter(u => u.faction === myFaction && u.state !== UnitState.Dead);
    const enemyUnits = state.entities.units.filter(u => u.faction !== myFaction && u.state !== UnitState.Dead);

    // 1. Tactical Production Loop
    if (state.economy[myFaction].credits > 1300) {
      const type = Math.random() > 0.65 ? 'Armored' : (Math.random() > 0.5 ? 'Air' : 'Infantry');
      UnitProduction.addToQueue(type, myFaction, time);
    }

    // 2. Tactical Unit Logic
    myUnits.forEach(u => {
      if (u.state === UnitState.Idle && u.commands.length === 0) {
        if (enemyUnits.length > 0) {
          // Find a random target
          const targetUnit = enemyUnits[Math.floor(Math.random() * enemyUnits.length)];
          useGameStore.getState().updateUnits(all => {
             const found = all.find(unit => unit.id === u.id);
             if (found) {
               found.commands = [{ 
                 type: 'MOVE', 
                 targetPos: { x: targetUnit.transform.x, y: targetUnit.transform.y } 
               }];
             }
          });
        }
      }
    });

    // 3. Support Resource Acquisition
    const idleHarvesters = myUnits.filter(u => u.class === 'Infantry' && u.state === UnitState.Idle && u.commands.length === 0);
    const nodes = state.entities.resources.filter(n => n.amount > 0);
    if (idleHarvesters.length > 0 && nodes.length > 0) {
       idleHarvesters.forEach(u => {
         const node = nodes[Math.floor(Math.random() * nodes.length)];
         useGameStore.getState().updateUnits(all => {
             const found = all.find(unit => unit.id === u.id);
             if (found) {
               found.commands = [{ 
                 type: 'HARVEST', 
                 targetId: node.id, 
                 targetPos: node.position 
               }];
             }
          });
       });
    }
  }
}
