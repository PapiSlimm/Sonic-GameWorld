'use client';
import { Input, Panel } from '@sonic-gameworld/ui';
import { useWizardStore } from '../../lib/wizard-store';
import { LicenseBuilder } from '../LicenseBuilder';

export function StepLicensePricing() {
  const { form, setLicenseFlag, setLicenseField, setPriceCents } = useWizardStore();

  return (
    <div className="flex flex-col gap-5">
      <Panel title="4. Pricing">
        <div className="max-w-xs">
          <Input
            label="Price (USD)"
            type="number"
            min={0}
            step="0.01"
            value={form.priceCents / 100}
            onChange={(e) => setPriceCents(Math.max(0, Math.round(Number(e.target.value) * 100)))}
            hint="Set to 0 to publish for free."
          />
        </div>
      </Panel>
      <LicenseBuilder value={form.license} onFlagChange={setLicenseFlag} onFieldChange={setLicenseField} />
    </div>
  );
}
