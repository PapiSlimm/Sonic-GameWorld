import type { PipelineContext, PipelineRecord, PipelineRunResult, Stage } from './types.js';

/** Runs `stages` in order starting at `startIndex`, persisting the running pipeline record to
 * AssetVersion.pipeline (as JSON) after every single stage so a crash mid-pipeline loses at most
 * one stage of progress, not the whole job. Stops early on FAILED (rejecting the asset) or
 * WAITING (pausing for creator approval) — everything else (OK/SKIPPED/SKIPPED_NO_DECIMATOR)
 * continues to the next stage. */
export async function runPipeline(ctx: PipelineContext, stages: Stage[], startIndex = 0): Promise<PipelineRunResult> {
  const existing = await loadExistingRecords(ctx);
  const records: PipelineRecord[] = existing.slice(0, startIndex);

  for (let i = startIndex; i < stages.length; i++) {
    const stage = stages[i]!;
    const startedAt = new Date().toISOString();
    ctx.log.info({ stage: stage.name, assetId: ctx.job.assetId, versionId: ctx.job.versionId }, 'stage:start');
    let record: PipelineRecord;
    try {
      const result = await stage.run(ctx);
      record = { stage: stage.name, status: result.status, startedAt, finishedAt: new Date().toISOString(), details: result.details, error: result.error };
    } catch (err) {
      record = {
        stage: stage.name,
        status: 'FAILED',
        startedAt,
        finishedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
    records.push(record);
    await persistProgress(ctx, records);
    ctx.log.info({ stage: stage.name, status: record.status }, 'stage:done');

    if (record.status === 'FAILED') {
      await ctx.prisma.assetVersion.update({ where: { id: ctx.job.versionId }, data: { status: 'FAILED' } });
      return { outcome: 'FAILED', records, failedAt: stage.name };
    }
    if (record.status === 'WAITING') {
      return { outcome: 'WAITING', records };
    }
  }

  return { outcome: 'COMPLETED', records };
}

async function loadExistingRecords(ctx: PipelineContext): Promise<PipelineRecord[]> {
  const version = await ctx.prisma.assetVersion.findUnique({ where: { id: ctx.job.versionId } });
  const pipeline = version?.pipeline;
  return Array.isArray(pipeline) ? (pipeline as PipelineRecord[]) : [];
}

async function persistProgress(ctx: PipelineContext, records: PipelineRecord[]): Promise<void> {
  await ctx.prisma.assetVersion.update({ where: { id: ctx.job.versionId }, data: { pipeline: records } });
}
