import type { ReactNode } from 'react';
import { Bot, GitCommitHorizontal, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge, Panel } from '@sonic-gameworld/ui';
import type { AssetPassport } from '@sonic-gameworld/gameworld-sdk';
import { formatDate } from '../../lib/format.js';

const SOURCE_LABEL: Record<AssetPassport['source'], string> = {
  ORIGINAL: 'Original creation',
  IMPORTED: 'Imported',
  AI_GENERATED: 'AI-generated',
  AI_ASSISTED: 'AI-assisted',
  REMIX: 'Remix / derivative',
};

/**
 * Asset Passport panel (CONTRACTS §6 `AssetPassport`): provenance, AI-generated/assisted flags,
 * dependencies and modification history — the "where did this come from" trust surface.
 */
export function AssetPassportPanel({ passport }: { passport: AssetPassport | null | undefined }) {
  if (!passport) return null;
  return (
    <Panel title="Asset passport" actions={<Badge tone="accent">{SOURCE_LABEL[passport.source]}</Badge>}>
      <div className="flex flex-col gap-4 text-sm">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <PassportStat icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Version" value={passport.version} />
          <PassportStat icon={<Sparkles className="h-3.5 w-3.5" />} label="AI generated" value={passport.aiGenerated ? 'Yes' : 'No'} tone={passport.aiGenerated ? 'accent' : undefined} />
          <PassportStat icon={<Bot className="h-3.5 w-3.5" />} label="AI assisted" value={passport.aiAssisted ? 'Yes' : 'No'} tone={passport.aiAssisted ? 'violet' : undefined} />
          <PassportStat icon={<GitCommitHorizontal className="h-3.5 w-3.5" />} label="3rd-party content" value={passport.thirdPartyContent ? 'Yes' : 'No'} tone={passport.thirdPartyContent ? 'warn' : undefined} />
        </div>

        {passport.aiProvenance && (
          <div className="rounded-control border border-accent2/30 bg-accent2/5 p-3 text-xs">
            <div className="font-hud uppercase tracking-wider text-accent2">AI provenance</div>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-text/80">
              <dt className="text-muted">Model</dt>
              <dd>{passport.aiProvenance.model} v{passport.aiProvenance.version}</dd>
              <dt className="text-muted">Generated</dt>
              <dd>{formatDate(passport.aiProvenance.timestamp)}</dd>
              <dt className="text-muted">Human modifications</dt>
              <dd>{passport.aiProvenance.humanModifications}</dd>
            </dl>
          </div>
        )}

        {passport.dependencies.length > 0 && (
          <div>
            <div className="font-hud text-[10px] uppercase tracking-wider text-muted">Dependencies</div>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {passport.dependencies.map((dep) => (
                <Badge key={dep}>{dep}</Badge>
              ))}
            </ul>
          </div>
        )}

        <div>
          <div className="font-hud text-[10px] uppercase tracking-wider text-muted">Modification history</div>
          <ol className="mt-1.5 space-y-2 border-l border-border pl-3">
            {passport.modificationHistory.map((entry, i) => (
              <li key={i} className="relative text-xs">
                <span className="absolute -left-[15px] top-1 h-2 w-2 rounded-full bg-accent" />
                <span className="text-text/80">{entry.note}</span>
                <span className="ml-2 text-muted">— {entry.by}, {formatDate(entry.at)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Panel>
  );
}

function PassportStat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone?: 'accent' | 'violet' | 'warn' }) {
  const toneCls = tone === 'accent' ? 'text-accent' : tone === 'violet' ? 'text-accent2' : tone === 'warn' ? 'text-warn' : 'text-text';
  return (
    <div className="rounded-control border border-border bg-bg p-2.5">
      <div className="flex items-center gap-1.5 font-hud text-[9px] uppercase tracking-wider text-muted">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-sm font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}
