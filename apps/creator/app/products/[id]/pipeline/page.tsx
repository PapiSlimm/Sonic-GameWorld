'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Badge, Panel } from '@sonic-gameworld/ui';
import { PIPELINE_STAGES, type PipelineStage } from '@sonic-gameworld/world-schema';
import { useApi } from '../../../../lib/api';
import { demoPipelineFor } from '../../../../lib/demo';
import { PipelineStages, type PipelineStageRow, type PipelineStageStatus } from '../../../../components/PipelineStages';

interface PipelineUpdatePayload {
  productId?: string;
  assetId?: string;
  stage: PipelineStage;
  status: PipelineStageStatus;
  message?: string;
}

function initialRows(): PipelineStageRow[] {
  return PIPELINE_STAGES.map((stage, i) => ({ stage, status: i === 0 ? 'RUNNING' : 'PENDING' }));
}

export default function ProductPipelinePage() {
  const params = useParams<{ id: string }>();
  const productId = params.id;
  const { client, status, identity } = useApi();
  const [rows, setRows] = useState<PipelineStageRow[]>(initialRows);
  const [live, setLive] = useState(false);
  const simIndexRef = useRef(0);

  // Live mode: subscribe to this creator's realtime topic and apply ASSET_PIPELINE_UPDATE events
  // that reference this product/asset (CONTRACTS §9 `GET /ws?token=`, topic `creator:<id>`).
  useEffect(() => {
    if (status !== 'live' || !identity) return;
    setRows(demoPipelineFor(productId).map(({ stage, status: st, message }) => ({ stage, status: st, message })));
    const handle = client.connectRealtime([`creator:${identity.userId}`], (msg) => {
      if (msg.type !== 'ASSET_PIPELINE_UPDATE') return;
      const payload = msg.payload as PipelineUpdatePayload;
      if (payload.productId && payload.productId !== productId) return;
      setLive(true);
      setRows((prev) => prev.map((r) => (r.stage === payload.stage ? { ...r, status: payload.status, message: payload.message } : r)));
    });
    return () => handle.close();
  }, [status, identity, client, productId]);

  // Demo/offline mode: simulate the pipeline advancing so the page still feels "live".
  useEffect(() => {
    if (status === 'live') return;
    setRows(demoPipelineFor(productId).map(({ stage, status: st, message }) => ({ stage, status: st === 'RUNNING' ? 'RUNNING' : st, message })));
    simIndexRef.current = 0;
    const interval = setInterval(() => {
      setRows((prev) => {
        const runningIdx = prev.findIndex((r) => r.status === 'RUNNING');
        if (runningIdx === -1) return prev;
        const next = [...prev];
        next[runningIdx] = { ...next[runningIdx]!, status: 'DONE' };
        const nextIdx = runningIdx + 1;
        if (nextIdx < next.length && next[nextIdx]!.status === 'PENDING') {
          next[nextIdx] = { ...next[nextIdx]!, status: 'RUNNING' };
        }
        return next;
      });
    }, 1800);
    return () => clearInterval(interval);
  }, [status, productId]);

  const doneCount = useMemo(() => rows.filter((r) => r.status === 'DONE').length, [rows]);
  const failed = rows.some((r) => r.status === 'FAILED');

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Publish pipeline</h1>
        <p className="text-sm text-muted">
          Product <span className="font-hud text-text/80">{productId}</span> — {doneCount}/{PIPELINE_STAGES.length} stages complete.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Badge tone={status === 'live' ? 'success' : 'warn'} dot>
          {status === 'live' ? (live ? 'Live updates connected' : 'Live — waiting for updates') : 'Demo — simulated progress'}
        </Badge>
        {failed && (
          <span className="inline-flex items-center gap-1 text-xs text-danger">
            <AlertTriangle className="h-3.5 w-3.5" /> A stage failed — see details below.
          </span>
        )}
      </div>

      <Panel title={`Pipeline (${PIPELINE_STAGES.length} stages)`}>
        <PipelineStages stages={rows} />
      </Panel>
    </div>
  );
}
