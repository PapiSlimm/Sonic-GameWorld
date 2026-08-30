import { useGameStore } from '../store/gameStore';
import { Unit, Command, UnitState } from '../types';

export class InputHandler {
  private static keys: Record<string, boolean> = {};
  private static mousePos: { x: number; y: number } = { x: 0, y: 0 };
  private static isMouseDown = false;

  static init() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.mousePos = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mousedown', () => {
      this.isMouseDown = true;
    });
    window.addEventListener('mouseup', () => {
      this.isMouseDown = false;
    });
  }

  static handleRTSCommand(worldX: number, worldY: number) {
    const state = useGameStore.getState();
    const selectedFaction = state.input.selectedFaction;
    const selectedUnits = state.entities.units.filter(
      u => u.isSelected && u.faction === selectedFaction && u.state !== UnitState.Dead
    );
    
    if (selectedUnits.length === 0) return;

    const isShiftPressed = !!this.keys['shift'];

    // Check if clicking on empty/active resource nodule
    const node = state.entities.resources.find(n => {
      const d = Math.sqrt(Math.pow(n.position.x - worldX, 2) + Math.pow(n.position.y - worldY, 2));
      return d < 45 && n.amount > 0;
    });

    if (node) {
      this.issueCommand(selectedUnits, { type: 'HARVEST', targetId: node.id, targetPos: node.position }, isShiftPressed);
    } else {
      this.issueCommand(selectedUnits, { type: 'MOVE', targetPos: { x: worldX, y: worldY } }, isShiftPressed);
    }
  }

  private static issueCommand(units: Unit[], cmd: Command, queue: boolean) {
    const spacing = units.length > 1 ? 32 : 0;
    
    useGameStore.getState().updateUnits(allUnits => {
      units.forEach((u, index) => {
        const found = allUnits.find(unit => unit.id === u.id);
        if (!found) return;

        let finalCmd = { ...cmd };
        if (cmd.type === 'MOVE' && cmd.targetPos && units.length > 1) {
          // Disperse cluster movement targets
          const offset = (index - (units.length - 1) / 2) * spacing;
          finalCmd.targetPos = { x: cmd.targetPos.x + offset, y: cmd.targetPos.y };
        }

        if (queue) {
          found.commands.push(finalCmd);
        } else {
          found.commands = [finalCmd];
          found.path = []; // Reset old path to trigger rebuilding
          found.targetNodeId = null;
        }
      });
    });
  }

  static updateFPS(_deltaTime: number, time: number) {
    const state = useGameStore.getState();
    if (state.input.viewMode !== 'FPS' || !state.input.focusedEntityId) return;

    const unit = state.entities.units.find(u => u.id === state.input.focusedEntityId);
    if (!unit || unit.state === UnitState.Dead) return;

    // Movement speeds translation
    let dx = 0, dy = 0;
    if (this.keys['w']) dy -= 1;
    if (this.keys['s']) dy += 1;
    if (this.keys['a']) dx -= 1;
    if (this.keys['d']) dx += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      unit.velocity.x += (dx / len) * (unit.speed * 20);
      unit.velocity.y += (dy / len) * (unit.speed * 20);
      unit.state = UnitState.Moving;
    }

    // Direct fire interactions
    if (this.isMouseDown && time - unit.lastFired > 180) {
      unit.lastFired = time;
      useGameStore.getState().updateProjectiles(projs => {
        projs.push({
          id: Math.random().toString(36).substring(2, 9),
          position: { x: unit.transform.x, y: unit.transform.y },
          targetPosition: { 
            x: unit.transform.x + Math.cos(unit.transform.rotation) * 850,
            y: unit.transform.y + Math.sin(unit.transform.rotation) * 850
          },
          speed: 1200,
          damage: unit.damage,
          ownerId: unit.id,
          faction: unit.faction
        });
      });
    }
  }

  static getMousePos() {
    return this.mousePos;
  }
}
