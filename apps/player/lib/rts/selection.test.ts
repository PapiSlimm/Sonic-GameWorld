import { describe, expect, it } from 'vitest';
import { isMarqueeDrag, pointInRect, unitsInMarquee } from './selection';

describe('pointInRect', () => {
  it('handles a rect dragged in any direction (start > end on either axis)', () => {
    const rect = { x0: 100, y0: 100, x1: 10, y1: 10 };
    expect(pointInRect({ x: 50, y: 50 }, rect)).toBe(true);
    expect(pointInRect({ x: 5, y: 5 }, rect)).toBe(false);
    expect(pointInRect({ x: 150, y: 50 }, rect)).toBe(false);
  });

  it('is inclusive of the rect boundary', () => {
    const rect = { x0: 0, y0: 0, x1: 10, y1: 10 };
    expect(pointInRect({ x: 0, y: 0 }, rect)).toBe(true);
    expect(pointInRect({ x: 10, y: 10 }, rect)).toBe(true);
  });
});

describe('isMarqueeDrag', () => {
  it('treats a tiny movement as a click, not a marquee', () => {
    expect(isMarqueeDrag({ x: 100, y: 100 }, { x: 101, y: 100 })).toBe(false);
  });

  it('treats a movement past the threshold as a marquee drag', () => {
    expect(isMarqueeDrag({ x: 100, y: 100 }, { x: 120, y: 100 })).toBe(true);
  });
});

describe('unitsInMarquee', () => {
  const candidates = [
    { id: 'own-1', screen: { x: 50, y: 50 }, factionId: 'raven-alliance' },
    { id: 'own-2', screen: { x: 500, y: 500 }, factionId: 'raven-alliance' },
    { id: 'enemy-1', screen: { x: 55, y: 55 }, factionId: 'united-dragon-nations' },
  ];
  const rect = { x0: 0, y0: 0, x1: 100, y1: 100 };

  it('selects only own-faction units inside the rect, never the enemy\'s', () => {
    expect(unitsInMarquee(candidates, rect, 'raven-alliance')).toEqual(['own-1']);
  });

  it('returns an empty selection when nothing of the local faction is inside the rect', () => {
    const emptyCornerRect = { x0: 700, y0: 700, x1: 900, y1: 900 };
    expect(unitsInMarquee(candidates, emptyCornerRect, 'raven-alliance')).toEqual([]);
  });
});
