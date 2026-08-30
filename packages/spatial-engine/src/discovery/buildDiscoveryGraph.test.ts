import { describe, expect, it } from 'vitest';
import { buildDiscoveryGraph, type DiscoveryProduct } from './buildDiscoveryGraph.js';

function product(overrides: Partial<DiscoveryProduct> & Pick<DiscoveryProduct, 'id' | 'name' | 'category'>): DiscoveryProduct {
  return { rating: 0, sales: 0, priceCents: 0, ...overrides };
}

describe('buildDiscoveryGraph', () => {
  it('returns an empty graph for an empty product list', () => {
    const graph = buildDiscoveryGraph([]);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it('places every node on the sphere surface (within the requested radius)', () => {
    const products: DiscoveryProduct[] = [
      product({ id: 'p1', name: 'World One', category: 'WORLD' }),
      product({ id: 'p2', name: 'World Two', category: 'WORLD' }),
      product({ id: 'p3', name: 'Vehicle Pack', category: 'VEHICLE' }),
    ];
    const graph = buildDiscoveryGraph(products, { radius: 50 });
    expect(graph.nodes).toHaveLength(3);
    for (const node of graph.nodes) {
      const r = Math.hypot(node.position.x, node.position.y, node.position.z);
      expect(r).toBeCloseTo(50, 5);
    }
  });

  it('groups products of the same category into one latitude band', () => {
    const products: DiscoveryProduct[] = [
      product({ id: 'p1', name: 'A', category: 'WORLD' }),
      product({ id: 'p2', name: 'B', category: 'WORLD' }),
      product({ id: 'p3', name: 'C', category: 'MISSION' }),
    ];
    const graph = buildDiscoveryGraph(products, { radius: 100 });
    const worldNodes = graph.nodes.filter((n) => n.category === 'WORLD');
    const missionNode = graph.nodes.find((n) => n.category === 'MISSION')!;
    expect(worldNodes).toHaveLength(2);
    expect(worldNodes[0]!.position.y).toBeCloseTo(worldNodes[1]!.position.y, 5);
    expect(worldNodes[0]!.position.y).not.toBeCloseTo(missionNode.position.y, 2);
  });

  it('connects same-category nodes with CATEGORY_RING edges', () => {
    const products: DiscoveryProduct[] = [
      product({ id: 'p1', name: 'A', category: 'WORLD' }),
      product({ id: 'p2', name: 'B', category: 'WORLD' }),
      product({ id: 'p3', name: 'C', category: 'WORLD' }),
    ];
    const graph = buildDiscoveryGraph(products);
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.edges.every((e) => e.kind === 'CATEGORY_RING')).toBe(true);
  });

  it('sizes nodes larger for higher rating and sales', () => {
    const products: DiscoveryProduct[] = [
      product({ id: 'p1', name: 'Popular', category: 'WORLD', rating: 5, sales: 10000 }),
      product({ id: 'p2', name: 'Unknown', category: 'GAME_KIT', rating: 0, sales: 0 }),
    ];
    const graph = buildDiscoveryGraph(products);
    const popular = graph.nodes.find((n) => n.productId === 'p1')!;
    const unknown = graph.nodes.find((n) => n.productId === 'p2')!;
    expect(popular.size).toBeGreaterThan(unknown.size);
  });

  it('is deterministic for the same input', () => {
    const products: DiscoveryProduct[] = [
      product({ id: 'p1', name: 'A', category: 'WORLD' }),
      product({ id: 'p2', name: 'B', category: 'CHARACTER' }),
    ];
    const a = buildDiscoveryGraph(products, { radius: 80 });
    const b = buildDiscoveryGraph(products, { radius: 80 });
    expect(a).toEqual(b);
  });
});
