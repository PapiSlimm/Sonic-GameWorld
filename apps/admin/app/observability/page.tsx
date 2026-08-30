'use client';
import { Activity, AlertOctagon, ClipboardList, FileText, Gauge, Waypoints } from 'lucide-react';
import { Badge, Panel, StatTile, cn, formatCents, formatCompact } from '@sonic-gameworld/ui';
import { useLiveOrDemo } from '../../lib/use-live.js';
import { BUSINESS_METRICS, DEMO_OPS_TILES, fetchAnalyticsOverview, fetchHealth, pickMetricValue } from '../../lib/observability.js';

const OPS_ICONS: Record<string, typeof FileText> = { logs: FileText, metrics: Gauge, traces: Waypoints, errors: AlertOctagon, alerts: AlertOctagon, audit: ClipboardList };

function Sparkline({ values, tone }: { values: number[]; tone: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="mt-2 flex h-8 items-end gap-0.5">
      {values.map((v, i) => (
        <div key={i} className={cn('w-full rounded-sm', tone)} style={{ height: `${Math.max((v / max) * 100, 6)}%` }} />
      ))}
    </div>
  );
}

export default function ObservabilityPage() {
  const health = useLiveOrDemo(fetchHealth, { health: { status: 'degraded' as const, version: 'demo', uptimeS: 0, timestamp: new Date().toISOString() }, ready: { ready: false, checks: {} } }, []);
  const analytics = useLiveOrDemo(fetchAnalyticsOverview, { period: { from: '', to: '' }, totals: {}, series: {} }, []);

  const statusTone = health.data.health.status === 'ok' ? 'success' : health.data.health.status === 'degraded' ? 'warn' : 'danger';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Observability</h1>
          <p className="text-sm text-muted">System operations and business telemetry across the platform.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={statusTone}>
            <Activity className="h-3 w-3" /> API {health.data.health.status}
          </Badge>
          <Badge tone={health.source === 'live' ? 'success' : 'warn'}>{health.source === 'live' ? 'Live' : 'Demo'}</Badge>
        </div>
      </div>

      <section>
        <h2 className="mb-3 font-hud text-[11px] uppercase tracking-[0.2em] text-muted">System operations</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {DEMO_OPS_TILES.map((tile) => {
            const Icon = OPS_ICONS[tile.key] ?? FileText;
            const barTone = tile.tone === 'danger' ? 'bg-danger/60' : tile.tone === 'warn' ? 'bg-warn/60' : tile.tone === 'accent' ? 'bg-accent/60' : 'bg-muted/40';
            return (
              <Panel key={tile.key} padded>
                <div className="flex items-center justify-between">
                  <span className="font-hud text-[10px] uppercase tracking-wider text-muted">{tile.label}</span>
                  <Icon className="h-3.5 w-3.5 text-muted" />
                </div>
                <div className="mt-1 font-hud text-xl font-semibold tabular-nums text-text">{formatCompact(tile.value)}</div>
                <Sparkline values={tile.trend} tone={barTone} />
              </Panel>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-hud text-[11px] uppercase tracking-[0.2em] text-muted">Business telemetry</h2>
          <Badge tone={analytics.source === 'live' ? 'success' : 'warn'}>{analytics.source === 'live' ? 'Live /v1/analytics' : 'Demo'}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {BUSINESS_METRICS.map((metric) => {
            const { value, live } = pickMetricValue(analytics.data.totals, metric);
            const display = metric.format === 'currency' ? formatCents(value) : metric.format === 'percent' ? `${value.toFixed(1)}%` : formatCompact(value);
            return (
              <StatTile
                key={metric.key}
                label={metric.label}
                value={display}
                delta={live ? undefined : metric.demoDelta}
                deltaLabel={live ? undefined : 'vs last period (demo)'}
                tone={metric.key === 'revenueCents' || metric.key === 'payoutsCents' ? 'accent' : 'default'}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
