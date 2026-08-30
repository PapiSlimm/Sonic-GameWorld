import { Unit } from '../types';

export class Steering {
  static getSeparation(unit: Unit, neighbors: Unit[]): { x: number; y: number } {
    let steering = { x: 0, y: 0 };
    let count = 0;
    
    for (const neighbor of neighbors) {
      if (neighbor.id === unit.id) continue;
      
      const dx = unit.transform.x - neighbor.transform.x;
      const dy = unit.transform.y - neighbor.transform.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      const radius = unit.class === 'Infantry' ? 24 : 45;
      
      if (dist > 0 && dist < radius) {
        const force = (radius - dist) / radius;
        steering.x += (dx / dist) * force;
        steering.y += (dy / dist) * force;
        count++;
      }
    }
    
    if (count > 0) {
      steering.x /= count;
      steering.y /= count;
    }
    
    return steering;
  }

  static getSeek(unit: Unit, target: { x: number; y: number }): { x: number; y: number } {
    const dx = target.x - unit.transform.x;
    const dy = target.y - unit.transform.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist === 0) return { x: 0, y: 0 };
    
    const maxSpeed = unit.speed * 80;
    
    return {
      x: (dx / dist) * maxSpeed - unit.velocity.x,
      y: (dy / dist) * maxSpeed - unit.velocity.y
    };
  }

  static getArrival(unit: Unit, target: { x: number; y: number }, radius: number = 40): { x: number; y: number } {
    const dx = target.x - unit.transform.x;
    const dy = target.y - unit.transform.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist === 0) return { x: 0, y: 0 };
    
    let speed = unit.speed * 80;
    if (dist < radius) {
      speed = (dist / radius) * speed;
    }
    
    return {
      x: (dx / dist) * speed - unit.velocity.x,
      y: (dy / dist) * speed - unit.velocity.y
    };
  }
}
