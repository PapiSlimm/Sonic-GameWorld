import type { ReactNode } from 'react';

export interface RailProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;
}

export function Rail({ title, subtitle, action, children, emptyMessage, isEmpty }: RailProps) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-hud text-[11px] uppercase tracking-[0.25em] text-muted">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-text/70">{subtitle}</p>}
        </div>
        {action}
      </div>
      {isEmpty ? (
        <div className="rounded-panel border border-dashed border-border p-6 text-sm text-muted">{emptyMessage ?? 'Nothing here yet.'}</div>
      ) : (
        <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">{children}</div>
      )}
    </section>
  );
}
