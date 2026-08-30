export const STARTING_CREDITS = 2500;
export const CELL_SIZE = 40;
export const GRID_WIDTH = 50;  // 50 * 40 = 2000 width
export const GRID_HEIGHT = 50; // 50 * 40 = 2000 height
export const COOLING_RATE = 0.4;
export const SOTOLIUM_CONVERSION_RATE = 2.0;

export const UNIT_STATS = {
  Infantry: { cost: 150, health: 100, speed: 2.2, attackRange: 160, damage: 12, detectionRadius: 200, heatPerShot: 0.12 },
  Armored: { cost: 450, health: 400, speed: 1.4, attackRange: 240, damage: 40, detectionRadius: 250, heatPerShot: 0.30 },
  Air: { cost: 750, health: 220, speed: 3.0, attackRange: 300, damage: 30, detectionRadius: 320, heatPerShot: 0.20 }
};

export const BUILDING_STATS = {
  Radar: { cost: 1000, health: 1500, size: { w: 2, h: 2 } },
  Barracks: { cost: 400, health: 1000, size: { w: 2, h: 2 } },
  Factory: { cost: 800, health: 1500, size: { w: 3, h: 3 } },
  Airfield: { cost: 1100, health: 1200, size: { w: 3, h: 3 } },
  Refinery: { cost: 600, health: 1200, size: { w: 2, h: 2 } }
};
