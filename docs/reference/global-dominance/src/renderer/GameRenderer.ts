import { Application, Container, Graphics } from 'pixi.js';
import { useGameStore } from '../store/gameStore';
import { Unit, Projectile, Faction, SotoliumNode, Building, UnitState } from '../types';
import { CELL_SIZE, GRID_WIDTH, GRID_HEIGHT } from '../constants';

export class GameRenderer {
  private app: Application | null = null;
  private unitLayer = new Container();
  private buildingLayer = new Container();
  private effectLayer = new Container();
  private resourceLayer = new Container();
  private fogLayer = new Graphics();
  private unitSprites = new Map<string, Container>();
  private projectileSprites = new Map<string, Graphics>();
  private buildingSprites = new Map<string, Container>();
  private resourceSprites = new Map<string, Graphics>();

  async init(container: HTMLDivElement) {
    this.app = new Application();
    await this.app.init({
      width: 2000,
      height: 2000,
      backgroundColor: 0x050508,
      antialias: true,
    });
    container.appendChild(this.app.canvas);

    const bgLayer = new Container();
    const grid = new Graphics();
    grid.moveTo(0, 0);
    
    for (let x = 0; x <= GRID_WIDTH; x++) {
      grid.moveTo(x * CELL_SIZE, 0).lineTo(x * CELL_SIZE, GRID_HEIGHT * CELL_SIZE);
    }
    for (let y = 0; y <= GRID_HEIGHT; y++) {
      grid.moveTo(0, y * CELL_SIZE).lineTo(GRID_WIDTH * CELL_SIZE, y * CELL_SIZE);
    }
    grid.stroke({ color: 0x14141d, width: 1 });
    bgLayer.addChild(grid);

    this.app.stage.addChild(
      bgLayer, 
      this.resourceLayer, 
      this.buildingLayer, 
      this.unitLayer, 
      this.effectLayer, 
      this.fogLayer
    );

    return this.app;
  }

  update(time: number) {
    if (!this.app) return;
    const state = useGameStore.getState();

    this.renderResources(state.entities.resources);
    this.renderBuildings(state.entities.buildings);
    this.renderUnits(state.entities.units, state.input.selectedFaction, time);
    this.renderProjectiles(state.entities.projectiles);
    this.renderFog(state.map.visibility);
    this.updateCamera(state);
  }

  private renderResources(nodes: SotoliumNode[]) {
    nodes.forEach(node => {
      let g = this.resourceSprites.get(node.id);
      if (!g) {
        g = new Graphics();
        g.circle(0, 0, 14).fill({ color: 0x00d8d8, alpha: 0.65 });
        this.resourceLayer.addChild(g);
        this.resourceSprites.set(node.id, g);
      }
      g.x = node.position.x;
      g.y = node.position.y;
      g.alpha = node.amount <= 0 ? 0 : 0.25 + (node.amount / 5000) * 0.75;
    });
  }

  private renderUnits(units: Unit[], playerFaction: Faction, time: number) {
    units.forEach(unit => {
      let container = this.unitSprites.get(unit.id);
      if (!container) {
        container = this.createUnitSprite(unit);
        this.unitLayer.addChild(container);
        this.unitSprites.set(unit.id, container);
      }

      if (unit.state === UnitState.Dead) {
        container.alpha -= 0.05;
        if (container.alpha <= 0) {
          this.unitLayer.removeChild(container);
          this.unitSprites.delete(unit.id);
        }
        return;
      }

      container.visible = unit.faction === playerFaction || unit.isDetected;
      
      container.x = unit.transform.x;
      container.y = unit.transform.y;
      
      const body = container.getChildByName('body') as Graphics;
      if (body) {
        body.rotation = unit.transform.rotation + Math.PI / 2;
      }
      
      const selectionRing = container.getChildByName('selectionRing') as Graphics;
      if (selectionRing) {
        selectionRing.visible = unit.isSelected;
      }
      
      const heatOverlay = container.getChildByName('heatOverlay') as Graphics;
      if (heatOverlay) {
        heatOverlay.visible = unit.heat > 0.1;
        if (heatOverlay.visible) {
          heatOverlay.clear()
            .circle(0, 0, 14 + Math.sin(time * 0.015) * 2.5)
            .fill({ color: 0xff3200, alpha: unit.heat * 0.45 });
        }
      }
    });

    this.unitSprites.forEach((sprite, id) => {
      if (!units.find(u => u.id === id)) {
        this.unitLayer.removeChild(sprite);
        this.unitSprites.delete(id);
      }
    });
  }

  private createUnitSprite(unit: Unit) {
    const container = new Container();
    const color = unit.faction === Faction.Raven ? 0x0070f3 : 0xe02424;
    
    const body = new Graphics();
    body.name = 'body';
    
    if (unit.class === 'Infantry') {
      body.circle(0, 0, 7).fill(color).stroke({ color: 0xffffff, width: 1.5 });
    } else if (unit.class === 'Armored') {
      body.rect(-10, -13, 20, 26).fill(color).stroke({ color: 0xffffff, width: 1.5 });
    } else {
      body.poly([0, -15, 14, 11, -14, 11]).fill(color).stroke({ color: 0xffffff, width: 1.5 });
    }
    container.addChild(body);

    const heatOverlay = new Graphics();
    heatOverlay.name = 'heatOverlay';
    container.addChild(heatOverlay);

    const selectionRing = new Graphics();
    selectionRing.name = 'selectionRing';
    selectionRing.circle(0, 0, 22).stroke({ color: 0x10b981, width: 2 });
    selectionRing.visible = false;
    container.addChild(selectionRing);

    return container;
  }

  private renderProjectiles(projectiles: Projectile[]) {
    projectiles.forEach(p => {
      let g = this.projectileSprites.get(p.id);
      if (!g) {
        g = new Graphics().circle(0, 0, 4.5).fill(0x38bdf8).stroke({ color: 0x0284c7, width: 1 });
        this.effectLayer.addChild(g);
        this.projectileSprites.set(p.id, g);
      }
      g.x = p.position.x;
      g.y = p.position.y;
    });

    this.projectileSprites.forEach((sprite, id) => {
      if (!projectiles.find(p => p.id === id)) {
        this.effectLayer.removeChild(sprite);
        this.projectileSprites.delete(id);
      }
    });
  }

  private renderBuildings(buildings: Building[]) {
    buildings.forEach(b => {
      let sprite = this.buildingSprites.get(b.id);
      if (!sprite) {
        sprite = this.createBuildingSprite(b);
        this.buildingLayer.addChild(sprite);
        this.buildingSprites.set(b.id, sprite);
      }
      const hpBar = sprite.getChildByName('hpBar') as Graphics;
      if (hpBar) {
        hpBar.clear()
          .rect(-22, -18, 44, 4.5).fill(0x1e1e24)
          .rect(-22, -18, 44 * (b.health / b.maxHealth), 4.5).fill(b.health / b.maxHealth > 0.35 ? 0x10b981 : 0xef4444);
      }
    });
  }

  private createBuildingSprite(b: Building) {
    const container = new Container();
    const color = b.faction === Faction.Raven ? 0x2563eb : 0xdc2626;
    
    const g = new Graphics();
    g.rect(0, 0, b.size.w * CELL_SIZE, b.size.h * CELL_SIZE)
      .fill({ color, alpha: 0.6 })
      .stroke({ color: 0xffffff, width: 2.2 });
    container.addChild(g);
    
    container.x = b.position.x * CELL_SIZE;
    container.y = b.position.y * CELL_SIZE;

    const hpBar = new Graphics();
    hpBar.name = 'hpBar';
    container.addChild(hpBar);

    return container;
  }

  private renderFog(visibilityMap: Record<string, boolean>) {
    this.fogLayer.clear();
    for (let x = 0; x < GRID_WIDTH; x++) {
      for (let y = 0; y < GRID_HEIGHT; y++) {
        if (!visibilityMap[`${x},${y}`]) {
          this.fogLayer.rect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
      }
    }
    this.fogLayer.fill({ color: 0x030306, alpha: 0.72 });
  }

  private updateCamera(state: any) {
    if (!this.app) return;
    const stage = this.app.stage;
    if (state.input.viewMode === 'FPS' && state.input.focusedEntityId) {
      const unit = state.entities.units.find((u: Unit) => u.id === state.input.focusedEntityId);
      if (unit && unit.state !== UnitState.Dead) {
        stage.pivot.x += (unit.transform.x - stage.pivot.x) * 0.12;
        stage.pivot.y += (unit.transform.y - stage.pivot.y) * 0.12;
        stage.position.x = this.app.renderer.width / 2;
        stage.position.y = this.app.renderer.height / 2;
        stage.scale.set(1.9);
      } else {
        stage.pivot.set(0, 0);
        stage.position.set(0, 0);
        stage.scale.set(1.0);
      }
    } else {
      stage.pivot.set(0, 0);
      stage.position.set(0, 0);
      stage.scale.set(1.0);
    }
  }

  destroy() {
    this.unitSprites.clear();
    this.buildingSprites.clear();
    this.projectileSprites.clear();
    this.resourceSprites.clear();
    this.app?.destroy(true, { children: true });
    this.app = null;
  }
}

export const gameRenderer = new GameRenderer();
