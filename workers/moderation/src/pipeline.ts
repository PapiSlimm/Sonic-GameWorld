import type { ModerationPipelineContext, ModerationRunResult, ModerationStage, StageRecord } from './types.js';

/** Runs `stages` in order from `startIndex`. Unlike worker-asset-processing's pipeline, there is
 * no per-refId `pipeline` Json column to persist progress into (ModerationItem only exists once
 * HUMAN_REVIEW actually creates one) — the run itself is short-lived (six cheap, mostly-CPU-bound
 * stages) and resumable state lives entirely in the ModerationItem row + the resume job's
 * `resumeFromIndex`/`resolution` fields. Stops early on FAILED (content rejected) or WAITING
 * (parked for human review). */
export async function runModerationPipeline(ctx: ModerationPipelineContext, stages: ModerationStage[], startIndex = 0): Promise<ModerationRunResult> {
  const records: StageRecord[] = [];

  for (let i = startIndex; i < stages.length; i++) {
    const stage = stages[i]!;
    ctx.log.info({ stage: stage.name, refKind: ctx.job.refKind, refId: ctx.job.refId }, 'stage:start');
    let record: StageRecord;
    try {
      const result = await stage.run(ctx);
      record = { stage: stage.name, status: result.status, details: result.details, error: result.error };
    } catch (err) {
      record = { stage: stage.name, status: 'FAILED', error: err instanceof Error ? err.message : String(err) };
    }
    records.push(record);
    ctx.log.info({ stage: stage.name, status: record.status }, 'stage:done');

    if (record.status === 'FAILED') return { outcome: 'FAILED', records, failedAt: stage.name };
    if (record.status === 'WAITING') return { outcome: 'WAITING', records };
  }

  return { outcome: 'COMPLETED', records };
}
