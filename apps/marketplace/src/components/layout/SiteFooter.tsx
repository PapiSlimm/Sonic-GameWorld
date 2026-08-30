import Link from 'next/link';
import { CATEGORY_SLUGS } from '../../lib/data.js';
import { CATEGORY_LABEL } from '../../lib/types.js';

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-panel/40">
      <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-8 px-6 py-10 text-sm sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <div className="font-hud text-xs uppercase tracking-[0.2em] text-accent">GameWorld Market</div>
          <p className="mt-2 max-w-xs text-xs text-muted">
            The spatial marketplace of Sonic GameWorld OS — worlds, games and assets, discovered like places instead of rows in a list.
          </p>
        </div>
        <div>
          <div className="font-hud text-[10px] uppercase tracking-[0.2em] text-muted">Categories</div>
          <ul className="mt-3 space-y-1.5">
            {Object.entries(CATEGORY_SLUGS).slice(0, 5).map(([category, slug]) => (
              <li key={slug}>
                <Link href={`/category/${slug}`} className="text-text/70 hover:text-accent">
                  {CATEGORY_LABEL[category as keyof typeof CATEGORY_LABEL]}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-hud text-[10px] uppercase tracking-[0.2em] text-muted">More</div>
          <ul className="mt-3 space-y-1.5">
            {Object.entries(CATEGORY_SLUGS).slice(5).map(([category, slug]) => (
              <li key={slug}>
                <Link href={`/category/${slug}`} className="text-text/70 hover:text-accent">
                  {CATEGORY_LABEL[category as keyof typeof CATEGORY_LABEL]}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-hud text-[10px] uppercase tracking-[0.2em] text-muted">Account</div>
          <ul className="mt-3 space-y-1.5">
            <li><Link href="/cart" className="text-text/70 hover:text-accent">Cart</Link></li>
            <li><Link href="/library" className="text-text/70 hover:text-accent">Library</Link></li>
            <li><Link href="/c/dreamforge" className="text-text/70 hover:text-accent">Creator storefronts</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border px-6 py-4 text-center font-hud text-[10px] uppercase tracking-[0.2em] text-muted">
        Sonic GameWorld OS — GameWorld Market · Port 3001
      </div>
    </footer>
  );
}
