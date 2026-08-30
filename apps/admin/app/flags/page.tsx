'use client';
import { useEffect, useState } from 'react';
import { Badge, Panel, Slider, Toggle, useToast } from '@sonic-gameworld/ui';
import { loadFlags, saveFlags, type FeatureFlag } from '../../lib/flags.js';

export default function FlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const toast = useToast();

  useEffect(() => setFlags(loadFlags()), []);

  const update = (key: string, patch: Partial<FeatureFlag>) => {
    setFlags((prev) => {
      const next = prev.map((f) => (f.key === key ? { ...f, ...patch, updatedAt: new Date().toISOString() } : f));
      saveFlags(next);
      return next;
    });
  };

  const toggle = (flag: FeatureFlag) => {
    update(flag.key, { enabled: !flag.enabled });
    toast.push({ title: flag.enabled ? 'Flag disabled' : 'Flag enabled', description: flag.name, tone: flag.enabled ? 'warn' : 'success' });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Feature Flags</h1>
          <p className="text-sm text-muted">Roll platform features out gradually by environment and percentage.</p>
        </div>
        <Badge tone="warn">Local only — no /v1/admin/flags route yet</Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {flags.map((flag) => (
          <Panel key={flag.key} title={flag.key} actions={<Toggle checked={flag.enabled} onChange={() => toggle(flag)} />}>
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-sm font-medium text-text">{flag.name}</div>
                <div className="mt-1 text-xs text-muted">{flag.description}</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {flag.environments.map((env) => (
                  <Badge key={env} tone={env === 'production' ? 'danger' : env === 'staging' ? 'warn' : 'default'}>{env}</Badge>
                ))}
              </div>
              <Slider label="Rollout" value={flag.rolloutPct} onChange={(v) => update(flag.key, { rolloutPct: v })} format={(v) => `${v}%`} />
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
