'use client';
import { Check, Loader2, X } from 'lucide-react';
import { cn } from '@sonic-gameworld/ui';
import type { PipelineStage } from '@sonic-gameworld/world-schema';

export type PipelineStageStatus = 'DONE' | 'RUNNING' | 'PENDING' | 'FAILED';

export interface PipelineStageRow {
  stage: PipelineStage;
  status: PipelineStageStatus;
  message?: string;
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  UPLOAD: 'Upload',
  MALWARE_SCAN: 'Malware scan',
  FILE_VALIDATION: 'File validation',
  METADATA_EXTRACTION: 'Metadata extraction',
  LICENSE_VALIDATION: 'License validation',
  '3D_VALIDATION': '3D validation',
  OPTIMIZATION: 'Optimization',
  LOD_GENERATION: 'LOD generation',
  TEXTURE_OPTIMIZATION: 'Texture optimization',
  THUMBNAILS: 'Thumbnails',
  PREVIEW_BUILD: 'Preview build',
  COMPATIBILITY_CHECK: 'Compatibility check',
  AI_TAGGING: 'AI tagging',
  QUALITY_SCORE: 'Quality score',
  CREATOR_APPROVAL: 'Creator approval',
  MARKETPLACE: 'Marketplace',
};

/** CONTRACTS §13 — the 16-stage asset publish pipeline, rendered as a live vertical stepper. */
export function PipelineStages({ stages }: { stages: PipelineStageRow[] }) {
  return (
    <ol className="flex flex-col">
      {stages.map((row, i) => {
        const isLast = i === stages.length - 1;
        return (
          <li key={row.stage} className="relative flex gap-3 pb-6 last:pb-0">
            {!isLast && (
              <span
                className={cn('absolute left-[11px] top-6 h-full w-px', row.status === 'DONE' ? 'bg-accent/60' : 'bg-border')}
                aria-hidden
              />
            )}
            <span
              className={cn(
                'z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-hud text-[10px]',
                row.status === 'DONE' && 'border-accent bg-accent/15 text-accent',
                row.status === 'RUNNING' && 'border-accent2 bg-accent2/15 text-accent2',
                row.status === 'PENDING' && 'border-border bg-panel text-muted',
                row.status === 'FAILED' && 'border-danger bg-danger/15 text-danger',
              )}
            >
              {row.status === 'DONE' && <Check className="h-3.5 w-3.5" />}
              {row.status === 'RUNNING' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {row.status === 'FAILED' && <X className="h-3.5 w-3.5" />}
              {row.status === 'PENDING' && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            </span>
            <div className="flex-1 pt-0.5">
              <p
                className={cn(
                  'text-sm font-medium',
                  row.status === 'PENDING' ? 'text-muted' : row.status === 'FAILED' ? 'text-danger' : 'text-text',
                )}
              >
                {STAGE_LABELS[row.stage]}
              </p>
              {row.message && <p className="mt-0.5 text-xs text-muted">{row.message}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
