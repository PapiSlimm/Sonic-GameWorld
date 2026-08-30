'use client';

import { useState } from 'react';
import type { LicenseIntent } from '@sonic-gameworld/gameworld-sdk';
import { Button, LicenseBadge, Panel, Toggle, type LicenseStatus } from '@sonic-gameworld/ui';
import { checkCompatibility } from '../../lib/data.js';
import type { DemoProduct } from '../../lib/types.js';

const INTENT_TOGGLES: { key: keyof LicenseIntent; label: string }[] = [
  { key: 'commercial', label: 'I plan to use this commercially' },
  { key: 'multiplayer', label: 'My project is multiplayer' },
  { key: 'redistribute', label: 'I need to redistribute it' },
  { key: 'modify', label: 'I need to modify it' },
];

const DEFAULT_INTENT: LicenseIntent = { commercial: true, multiplayer: false, redistribute: false, modify: false };

/** "Check compatibility with my project" — calls the shared `checkLicenseCompatibility` engine (CONTRACTS §6). */
export function CompatibilityChecker({ product }: { product: DemoProduct }) {
  const [intent, setIntent] = useState<LicenseIntent>(DEFAULT_INTENT);
  const [result, setResult] = useState<{ status: LicenseStatus; reasons: string[] } | null>(null);
  const [checking, setChecking] = useState(false);

  const run = async () => {
    setChecking(true);
    try {
      const res = await checkCompatibility({ licenses: [product.license], intent });
      setResult({ status: res.status, reasons: res.reasons });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Panel title="Check compatibility with my project">
      <div className="flex flex-col gap-3">
        {INTENT_TOGGLES.map(({ key, label }) => (
          <Toggle
            key={key}
            checked={Boolean(intent[key])}
            onChange={(checked) => {
              setResult(null);
              setIntent((prev) => ({ ...prev, [key]: checked }));
            }}
            label={label}
            size="sm"
          />
        ))}
        <Button variant="secondary" size="sm" onClick={run} loading={checking} className="self-start">
          Run compatibility check
        </Button>
        {result && (
          <div className="rounded-control border border-border bg-bg p-3">
            <LicenseBadge status={result.status} />
            <ul className="mt-2 space-y-1 text-xs text-muted">
              {result.reasons.map((reason, i) => (
                <li key={i}>• {reason}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}
