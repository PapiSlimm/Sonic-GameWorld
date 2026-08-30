'use client';
import { useMemo } from 'react';
import { Input, LicenseBadge, Panel, Toggle } from '@sonic-gameworld/ui';
import { checkLicenseCompatibility } from '@sonic-gameworld/world-schema';
import { buildLicenseRecord, summarizeLicense } from '../lib/license';
import { LICENSE_FLAG_LABELS, LICENSE_FLAG_ORDER, type LicenseFlagKey, type LicenseFormState } from '../lib/types';

export interface LicenseBuilderProps {
  value: LicenseFormState;
  onFlagChange: (key: LicenseFlagKey, value: boolean) => void;
  onFieldChange: (patch: Partial<Pick<LicenseFormState, 'attributionText' | 'seats' | 'spdx'>>) => void;
}

/** The publish wizard's License Builder: all 10 flags + attribution + seats, live `LicenseBadge` preview. */
export function LicenseBuilder({ value, onFlagChange, onFieldChange }: LicenseBuilderProps) {
  const record = useMemo(() => buildLicenseRecord(value), [value]);
  const summary = useMemo(() => summarizeLicense(record), [record]);

  // Preview compatibility against the two most common buyer intents.
  const commercialMultiplayer = useMemo(
    () => checkLicenseCompatibility([record], { commercial: true, multiplayer: true, redistribute: false, modify: true }),
    [record],
  );
  const personalOnly = useMemo(
    () => checkLicenseCompatibility([record], { commercial: false, multiplayer: false, redistribute: false, modify: false }),
    [record],
  );

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <Panel title="License flags" className="flex-1">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {LICENSE_FLAG_ORDER.map((key) => (
            <label key={key} className="flex items-start justify-between gap-3 rounded-control border border-border/60 p-3">
              <span>
                <span className="block text-sm text-text">{LICENSE_FLAG_LABELS[key].label}</span>
                <span className="block text-xs text-muted">{LICENSE_FLAG_LABELS[key].hint}</span>
              </span>
              <Toggle checked={value.flags[key]} onChange={(checked) => onFlagChange(key, checked)} />
            </label>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            label="Attribution text"
            placeholder='e.g. "Made with NovaForge"'
            value={value.attributionText}
            disabled={!value.flags.attribution}
            onChange={(e) => onFieldChange({ attributionText: e.target.value })}
          />
          <Input
            label="Seats"
            type="number"
            min={0}
            placeholder="Unlimited"
            value={value.seats ?? ''}
            onChange={(e) => onFieldChange({ seats: e.target.value === '' ? null : Number(e.target.value) })}
          />
          <Input
            label="SPDX id (optional)"
            placeholder="e.g. CC-BY-4.0"
            value={value.spdx}
            onChange={(e) => onFieldChange({ spdx: e.target.value })}
          />
        </div>
      </Panel>

      <Panel title="Live preview" className="w-full lg:w-80">
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-1.5 font-hud text-[10px] uppercase tracking-wider text-muted">Commercial + multiplayer buyer</p>
            <LicenseBadge status={commercialMultiplayer.status} reasons={commercialMultiplayer.reasons} />
          </div>
          <div>
            <p className="mb-1.5 font-hud text-[10px] uppercase tracking-wider text-muted">Personal-use-only buyer</p>
            <LicenseBadge status={personalOnly.status} reasons={personalOnly.reasons} />
          </div>
          <div className="border-t border-border pt-3">
            <p className="mb-1.5 font-hud text-[10px] uppercase tracking-wider text-muted">Summary</p>
            <ul className="flex flex-col gap-1 text-xs text-text/80">
              {summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>
    </div>
  );
}
