// Slug helpers shared by every module that mints a human-readable, URL-safe, unique slug
// (products here; worlds/games mint their own equivalents in their own modules).
import type { PrismaLike } from '../../db.js';

/** Lowercase, ascii, hyphenated slug base from a display name. */
export function slugify(input: string): string {
  const base = input
    .normalize('NFKD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '') // strip combining diacritics left behind by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.length > 0 ? base.slice(0, 60) : 'item';
}

/** Append `-2`, `-3`, ... until `exists()` reports no collision. */
export async function uniqueSlug(base: string, exists: (candidate: string) => Promise<boolean>): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  let suffix = 2;
  // Bounded loop: in the pathological case of thousands of collisions we still terminate instead
  // of looping forever, falling back to a random tail.
  while (await exists(candidate)) {
    candidate = `${root}-${suffix}`;
    suffix += 1;
    if (suffix > 500) {
      candidate = `${root}-${Math.random().toString(36).slice(2, 8)}`;
      break;
    }
  }
  return candidate;
}

/** Convenience wrapper over `uniqueSlug` for `Product.slug`. */
export async function uniqueProductSlug(prisma: PrismaLike, name: string): Promise<string> {
  return uniqueSlug(name, async (candidate) => Boolean(await prisma.product.findUnique({ where: { slug: candidate } })));
}
