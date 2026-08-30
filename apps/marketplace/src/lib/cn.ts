import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Local copy of `@sonic-gameworld/ui`'s `cn` helper (same implementation).
 *
 * `@sonic-gameworld/ui` bundles its whole public surface into one `dist/index.js`, and because that
 * bundle also contains client-only components tagged `'use client'`, the *entire* bundle is treated as
 * a client boundary by Next's RSC runtime — so calling `cn()` (a plain function, not a rendered
 * component) from a Server Component throws "Attempted to call cn() from the server but cn is on the
 * client", even though `cn` itself has no client-only behavior. Server-rendered pieces here (e.g.
 * `ProductThumb`, `/category/[slug]`) import this local copy instead; client components can keep using
 * either.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
