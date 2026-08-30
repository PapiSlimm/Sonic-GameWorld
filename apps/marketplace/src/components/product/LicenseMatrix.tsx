import { Check, X } from 'lucide-react';
import { Panel } from '@sonic-gameworld/ui';
import type { LicenseRecord } from '@sonic-gameworld/gameworld-sdk';

const FLAG_ROWS: { key: keyof LicenseRecord; label: string }[] = [
  { key: 'personal', label: 'Personal use' },
  { key: 'commercial', label: 'Commercial use' },
  { key: 'enterprise', label: 'Enterprise use' },
  { key: 'modification', label: 'Modification' },
  { key: 'redistribution', label: 'Redistribution' },
  { key: 'multiplayer', label: 'Multiplayer' },
  { key: 'resale', label: 'Resale' },
  { key: 'sublicensing', label: 'Sublicensing' },
  { key: 'aiTraining', label: 'AI training' },
  { key: 'attribution', label: 'Attribution required' },
];

/** Full license matrix — every flag on `LicenseRecord`, not just the summary badge. */
export function LicenseMatrix({ license }: { license: LicenseRecord }) {
  return (
    <Panel title="License terms" padded={false}>
      <ul className="divide-y divide-border">
        {FLAG_ROWS.map(({ key, label }) => {
          const value = license[key] === true;
          return (
            <li key={key} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-text/80">{label}</span>
              {value ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-muted/60" />}
            </li>
          );
        })}
        {license.seats !== undefined && (
          <li className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-text/80">Seats</span>
            <span className="font-hud text-xs text-text">{license.seats}</span>
          </li>
        )}
        {license.attributionText && (
          <li className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-text/80">Attribution text</span>
            <span className="text-right text-xs text-muted">{license.attributionText}</span>
          </li>
        )}
        {license.spdx && (
          <li className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-text/80">SPDX / reference</span>
            <span className="font-hud text-xs text-muted">{license.spdx}</span>
          </li>
        )}
      </ul>
    </Panel>
  );
}
