'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { checkLicenseCompatibility, LICENSE_PRESETS, PRODUCT_CATEGORIES, randomUuid, type LicensePresetName } from '@sonic-gameworld/world-schema';
import type { Genre, LicenseRecord, ProductCategory, WorldDocument } from '@sonic-gameworld/gameworld-sdk';
import { GENRES } from '@sonic-gameworld/world-schema';
import { Badge, Button, Input, LicenseBadge, Panel, PriceTag, Select, Toggle, useToast } from '@sonic-gameworld/ui';
import { CheckCircle2, ShieldCheck, UploadCloud } from 'lucide-react';
import { getClient } from '../../lib/client';
import { useStudioStore } from '../../lib/store';
import { titleCase } from '../../lib/format';

const PRESET_NAMES: LicensePresetName[] = ['STANDARD', 'PERSONAL', 'ENTERPRISE', 'CC_BY', 'CC0'];

type LicenseFlagKey = 'commercial' | 'personal' | 'enterprise' | 'redistribution' | 'modification' | 'multiplayer' | 'aiTraining' | 'resale' | 'sublicensing' | 'attribution';

const LICENSE_FLAGS: { key: LicenseFlagKey; label: string }[] = [
  { key: 'commercial', label: 'Commercial use' },
  { key: 'personal', label: 'Personal use' },
  { key: 'enterprise', label: 'Enterprise use' },
  { key: 'redistribution', label: 'Redistribution' },
  { key: 'modification', label: 'Modification' },
  { key: 'multiplayer', label: 'Multiplayer' },
  { key: 'aiTraining', label: 'AI training' },
  { key: 'resale', label: 'Resale' },
  { key: 'sublicensing', label: 'Sublicensing' },
  { key: 'attribution', label: 'Attribution required' },
];

export interface PublishWizardProps {
  document: WorldDocument;
}

export function PublishWizard({ document }: PublishWizardProps) {
  const params = useParams<{ id: string }>();
  const offline = useStudioStore((s) => s.offline);
  const { push } = useToast();
  const [category, setCategory] = useState<ProductCategory>('WORLD');
  const [genres, setGenres] = useState<Genre[]>(document.genre.length ? document.genre : ['CYBERPUNK']);
  const [priceUsd, setPriceUsd] = useState(19);
  const [preset, setPreset] = useState<LicensePresetName>('STANDARD');
  const [license, setLicense] = useState<LicenseRecord>(() => LICENSE_PRESETS.STANDARD(`lic_${document.id}`));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [published, setPublished] = useState<{ productId?: string; status: string } | null>(null);

  const applyPreset = (name: LicensePresetName) => {
    setPreset(name);
    setLicense(LICENSE_PRESETS[name](`lic_${document.id}_${name.toLowerCase()}`));
  };

  const compatibility = useMemo(
    () =>
      checkLicenseCompatibility([license, ...document.dependencies.map((d) => d.license)], {
        commercial: true,
        multiplayer: document.maxPlayers > 1,
        redistribute: license.redistribution,
        modify: license.modification,
      }),
    [license, document.dependencies, document.maxPlayers],
  );

  const toggleGenre = (g: Genre) => setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  const submit = async () => {
    setSubmitting(true);
    try {
      if (!offline) {
        try {
          const result = await getClient().worlds.publish(params.id, {
            visibility: 'PUBLIC',
            priceCents: Math.round(priceUsd * 100),
            category,
            notes,
          });
          setPublished({ productId: result.productId, status: result.status });
          push({ title: `World ${result.status === 'PUBLISHED' ? 'published' : 'submitted for review'}`, tone: 'success' });
          return;
        } catch {
          // fall through to the offline confirmation below
        }
      }
      setPublished({ productId: randomUuid(), status: 'PENDING_REVIEW' });
      push({ title: 'Publish simulated (offline demo)', description: 'Connect the API to publish for real.', tone: 'info' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 overflow-y-auto p-6">
      <Panel title="1 · Category & Genre">
        <div className="grid grid-cols-2 gap-4">
          <Select label="Category" value={category} options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: titleCase(c) }))} onChange={(e) => setCategory(e.target.value as ProductCategory)} />
          <div>
            <span className="font-hud text-[11px] uppercase tracking-wider text-muted">Genres</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {GENRES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggleGenre(g)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${genres.includes(g) ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border bg-bg text-muted'}`}
                >
                  {titleCase(g)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="2 · Price">
        <div className="flex items-center gap-4">
          <Input
            label="Price (USD)"
            type="number"
            min={0}
            step={1}
            value={priceUsd}
            onChange={(e) => setPriceUsd(Number(e.target.value))}
            className="w-40"
          />
          <PriceTag cents={Math.round(priceUsd * 100)} size="lg" />
        </div>
      </Panel>

      <Panel title="3 · License builder">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1.5">
            {PRESET_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => applyPreset(name)}
                className={`rounded-full border px-3 py-1 text-xs ${preset === name ? 'border-accent2/50 bg-accent2/10 text-accent2' : 'border-border bg-bg text-muted'}`}
              >
                {titleCase(name)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {LICENSE_FLAGS.map(({ key, label }) => (
              <Toggle
                key={key}
                size="sm"
                checked={Boolean(license[key])}
                onChange={(v) => setLicense((prev) => ({ ...prev, [key]: v }))}
                label={label}
              />
            ))}
          </div>
          <Input label="Attribution text (optional)" value={license.attributionText ?? ''} onChange={(e) => setLicense((prev) => ({ ...prev, attributionText: e.target.value || undefined }))} />
        </div>
      </Panel>

      <Panel title="4 · Compatibility check">
        <div className="flex flex-col gap-2">
          <LicenseBadge status={compatibility.status} reasons={compatibility.reasons} />
          <ul className="flex flex-col gap-1 text-xs text-muted">
            {compatibility.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
                {r}
              </li>
            ))}
          </ul>
          {document.dependencies.length > 0 && <p className="text-xs text-muted">Checked against {document.dependencies.length} bundled dependency license(s).</p>}
        </div>
      </Panel>

      <Panel title="5 · Asset Passport summary">
        <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
          <SummaryItem label="Creator" value={document.passport.creatorId} />
          <SummaryItem label="Source" value={document.passport.source} />
          <SummaryItem label="Version" value={String(document.passport.version)} />
          <SummaryItem label="AI generated" value={document.passport.aiGenerated ? 'Yes' : 'No'} />
          <SummaryItem label="AI assisted" value={document.passport.aiAssisted ? 'Yes' : 'No'} />
          <SummaryItem label="3rd-party content" value={document.passport.thirdPartyContent ? 'Yes' : 'No'} />
        </dl>
      </Panel>

      <div className="flex items-center justify-between rounded-panel border border-border bg-panel p-4">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes for reviewers (optional)…"
          rows={2}
          className="mr-4 flex-1 resize-none rounded-control border border-border bg-bg p-2 text-xs text-text focus:border-accent focus:outline-none"
        />
        <Button variant="primary" loading={submitting} onClick={() => void submit()} leftIcon={<UploadCloud className="h-4 w-4" />}>
          Submit for Publish
        </Button>
      </div>

      {published && (
        <div className="flex items-center gap-2 rounded-panel border border-success/40 bg-success/10 p-4 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" />
          <span>
            Status: <Badge tone="success">{published.status}</Badge>
            {published.productId && <span className="ml-2 font-hud text-xs text-text/70">Product {published.productId}</span>}
          </span>
        </div>
      )}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-hud text-[9px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="truncate text-text/85">{value}</dd>
    </div>
  );
}
