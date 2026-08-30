import { z } from 'zod';

export const WORLD_SCHEMA_VERSION = '1.0.0' as const;

export const Vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });
export type Vec3 = z.infer<typeof Vec3Schema>;

export const QuatSchema = z.object({ x: z.number(), y: z.number(), z: z.number(), w: z.number() });
export type Quat = z.infer<typeof QuatSchema>;

export const TransformSchema = z.object({
  position: Vec3Schema,
  rotation: QuatSchema,
  scale: Vec3Schema,
});
export type Transform = z.infer<typeof TransformSchema>;

export const GeoAnchorSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  altM: z.number(),
});
export type GeoAnchor = z.infer<typeof GeoAnchorSchema>;

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const quatIdentity = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 });
export const identityTransform = (): Transform => ({ position: vec3(), rotation: quatIdentity(), scale: vec3(1, 1, 1) });
export const transformAt = (x: number, y: number, z: number, scale = 1): Transform => ({
  position: vec3(x, y, z),
  rotation: quatIdentity(),
  scale: vec3(scale, scale, scale),
});

/** Deterministic UUID v4-shaped ids, derived from a seed string (no crypto dependency needed for sample data). */
export function seededUuid(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0;
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  const a = hex(h1);
  const b = hex(h2);
  const c = hex((Math.imul(h1, 31) ^ h2) >>> 0);
  const d = hex((Math.imul(h2, 17) ^ h1) >>> 0);
  // xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (32 hex digits total)
  const y = ['8', '9', 'a', 'b'][h1 & 3] as string;
  return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-${y}${c.slice(1, 4)}-${c.slice(4, 8)}${d}`;
}

export function randomUuid(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return seededUuid(`${Date.now()}-${Math.random()}`);
}
