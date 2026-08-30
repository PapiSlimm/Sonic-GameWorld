import {
  Bot,
  Car,
  Clapperboard,
  Flag,
  Gamepad2,
  Globe2,
  Cpu,
  Trees,
  User,
  Package,
  type LucideIcon,
} from 'lucide-react';
import type { ProductCategory } from '@sonic-gameworld/gameworld-sdk';
import { cn } from '../../lib/cn.js';
import { DEMO_COLORWAY } from '../../lib/demo.js';

const CATEGORY_ICON: Record<ProductCategory, LucideIcon> = {
  WORLD: Globe2,
  GAME_KIT: Package,
  SYSTEM: Cpu,
  AI_AGENT: Bot,
  CHARACTER: User,
  VEHICLE: Car,
  ENVIRONMENT: Trees,
  CINEMATIC: Clapperboard,
  MISSION: Flag,
  EXPERIENCE: Gamepad2,
};

const FALLBACK_COLORWAY: [string, string] = ['#38F5C8', '#7C5CFF'];

export interface ProductThumbProps {
  productId: string;
  category: ProductCategory;
  thumbnailUrl?: string | null;
  className?: string;
  iconClassName?: string;
}

/**
 * Every demo product's `thumbnailUrl` is `null` — there's no real asset pipeline in this offline
 * build — so listings render a deterministic colorway gradient (per-product, from `DEMO_COLORWAY`)
 * with the category icon, instead of a broken `<img>`. Swaps in the real thumbnail automatically the
 * moment `thumbnailUrl` is set by a live backend.
 */
export function ProductThumb({ productId, category, thumbnailUrl, className, iconClassName }: ProductThumbProps) {
  if (thumbnailUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={thumbnailUrl} alt="" className={cn('h-full w-full object-cover', className)} />;
  }
  const [from, to] = DEMO_COLORWAY[productId] ?? FALLBACK_COLORWAY;
  const Icon = CATEGORY_ICON[category];
  return (
    <div
      className={cn('relative flex items-center justify-center overflow-hidden', className)}
      style={{ background: `linear-gradient(135deg, ${from}33 0%, ${to}33 55%, #05070B 100%)` }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.08),transparent_55%)]" />
      <Icon className={cn('relative h-8 w-8 text-text/70', iconClassName)} style={{ color: from }} strokeWidth={1.5} />
    </div>
  );
}

export { CATEGORY_ICON };
