'use client';
import { cn } from '@sonic-gameworld/ui';
import { EVENT_TYPES, type EventType } from '../lib/webhooks';

/** Multi-select chip grid over the `EventType` union — there is no MultiSelect in `@sonic-gameworld/ui` yet. */
export function EventTypeSelect({ value, onChange, className }: { value: EventType[]; onChange: (next: EventType[]) => void; className?: string }) {
  const toggle = (type: EventType) => {
    onChange(value.includes(type) ? value.filter((t) => t !== type) : [...value, type]);
  };

  return (
    <div className={cn('flex max-h-56 flex-wrap gap-1.5 overflow-y-auto rounded-control border border-border bg-bg p-2', className)}>
      {EVENT_TYPES.map((type) => {
        const active = value.includes(type);
        return (
          <button
            key={type}
            type="button"
            onClick={() => toggle(type)}
            className={cn(
              'rounded-full border px-2.5 py-1 font-hud text-[10px] tracking-wide transition-colors',
              active ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border text-muted hover:text-text',
            )}
          >
            {type}
          </button>
        );
      })}
    </div>
  );
}
