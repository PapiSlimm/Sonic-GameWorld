'use client';
import { useRouter } from 'next/navigation';
import { Badge, Button, LicenseBadge, Panel, PriceTag, useToast } from '@sonic-gameworld/ui';
import { checkLicenseCompatibility } from '@sonic-gameworld/world-schema';
import type { CreateProductInput } from '@sonic-gameworld/gameworld-sdk';
import { buildLicenseRecord, summarizeLicense } from '../../lib/license';
import { useWizardStore } from '../../lib/wizard-store';
import { useApi } from '../../lib/api';

export function StepReview() {
  const { form, submitting, submitError, setSubmitting, setSubmitError, reset } = useWizardStore();
  const { client, status } = useApi();
  const router = useRouter();
  const { push } = useToast();

  const license = buildLicenseRecord(form.license);
  const compat = checkLicenseCompatibility([license], { commercial: true, multiplayer: true, redistribute: false, modify: true });
  const refKind = form.kind === 'ASSET' ? 'ASSET' : 'WORLD';
  const refId = form.kind === 'ASSET' ? form.assetId : form.worldId;

  const canSubmit = Boolean(form.category && form.name.trim() && refId);

  const handleSubmit = async () => {
    if (!canSubmit || !form.category || !refId) return;
    setSubmitting(true);
    setSubmitError(null);
    const longDescription = form.specs.trim() ? `${form.description}\n\nSpecs:\n${form.specs.trim()}` : form.description;
    const input: CreateProductInput = {
      name: form.name.trim(),
      category: form.category,
      genre: form.genre as CreateProductInput['genre'],
      engines: form.engines as CreateProductInput['engines'],
      priceCents: form.priceCents,
      description: form.description.trim() || form.name.trim(),
      longDescription,
      refKind,
      refId,
      license,
    };
    try {
      let productId: string;
      if (status === 'live') {
        const product = await client.products.create(input);
        productId = product.id;
      } else {
        // Offline demo — no backend to persist to; synthesize an id so the pipeline view still works.
        await new Promise((r) => setTimeout(r, 400));
        productId = `prod_demo_${Date.now()}`;
      }
      push({ title: 'Product submitted', description: `${input.name} is on its way through the publish pipeline.`, tone: 'success' });
      reset();
      router.push(`/products/${productId}/pipeline`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit product');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Panel title="5. Review passport & submit">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="font-hud text-[10px] uppercase tracking-wider text-muted">Name</dt>
            <dd className="text-sm text-text">{form.name || '—'}</dd>
          </div>
          <div>
            <dt className="font-hud text-[10px] uppercase tracking-wider text-muted">Category</dt>
            <dd className="text-sm text-text">{form.category ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-hud text-[10px] uppercase tracking-wider text-muted">Source</dt>
            <dd className="text-sm text-text">
              {form.kind === 'ASSET' ? `Asset upload (${form.assetFileName ?? 'none'})` : `World (${form.worldId ?? 'none'})`}
            </dd>
          </div>
          <div>
            <dt className="font-hud text-[10px] uppercase tracking-wider text-muted">Price</dt>
            <dd className="text-sm text-text"><PriceTag cents={form.priceCents} size="sm" /></dd>
          </div>
          <div>
            <dt className="font-hud text-[10px] uppercase tracking-wider text-muted">Genre</dt>
            <dd className="flex flex-wrap gap-1 text-sm text-text">
              {form.genre.length > 0 ? form.genre.map((g) => <Badge key={g}>{g}</Badge>) : '—'}
            </dd>
          </div>
          <div>
            <dt className="font-hud text-[10px] uppercase tracking-wider text-muted">Engines</dt>
            <dd className="flex flex-wrap gap-1 text-sm text-text">
              {form.engines.length > 0 ? form.engines.map((e) => <Badge key={e} tone="violet">{e}</Badge>) : '—'}
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel title="License & Asset Passport">
        <div className="flex flex-col gap-3">
          <LicenseBadge status={compat.status} reasons={compat.reasons} />
          <ul className="flex flex-col gap-1 text-sm text-text/80">
            {summarizeLicense(license).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </Panel>

      {!canSubmit && <p className="text-xs text-warn">Complete the category, name and upload/world steps before submitting.</p>}
      {submitError && <p className="text-xs text-danger">{submitError}</p>}

      <div className="flex justify-end">
        <Button size="lg" disabled={!canSubmit} loading={submitting} onClick={() => void handleSubmit()}>
          Submit for publishing
        </Button>
      </div>
    </div>
  );
}
