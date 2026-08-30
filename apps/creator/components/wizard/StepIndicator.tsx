'use client';
import { Check } from 'lucide-react';
import { cn } from '@sonic-gameworld/ui';
import { WIZARD_STEPS, type WizardStepIndex } from '../../lib/wizard-store';

export function StepIndicator({ current }: { current: WizardStepIndex }) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {WIZARD_STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full border font-hud text-[11px]',
                done && 'border-accent bg-accent/15 text-accent',
                active && !done && 'border-accent2 bg-accent2/15 text-accent2',
                !active && !done && 'border-border bg-panel text-muted',
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cn('text-xs', active ? 'text-text' : 'text-muted')}>{label}</span>
            {i < WIZARD_STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
