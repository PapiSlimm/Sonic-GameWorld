'use client';
import { useEffect } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@sonic-gameworld/ui';
import { useWizardStore } from '../../../lib/wizard-store';
import { StepIndicator } from '../../../components/wizard/StepIndicator';
import { StepTypeCategory } from '../../../components/wizard/StepTypeCategory';
import { StepUpload } from '../../../components/wizard/StepUpload';
import { StepDetails } from '../../../components/wizard/StepDetails';
import { StepLicensePricing } from '../../../components/wizard/StepLicensePricing';
import { StepReview } from '../../../components/wizard/StepReview';

function useCanAdvance(): boolean {
  const { step, form } = useWizardStore();
  switch (step) {
    case 0:
      return form.category !== null;
    case 1:
      return form.kind === 'ASSET' ? form.assetFileKey !== null : form.worldId !== null;
    case 2:
      return form.name.trim().length > 0;
    case 3:
      return true;
    default:
      return true;
  }
}

export default function NewProductPage() {
  const { step, next, back, reset } = useWizardStore();
  const canAdvance = useCanAdvance();

  // Start every visit to the wizard fresh.
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-text">Publish a product</h1>
        <p className="text-sm text-muted">Five steps from raw asset (or world) to a marketplace listing with a full Asset Passport.</p>
      </div>

      <StepIndicator current={step} />

      {step === 0 && <StepTypeCategory />}
      {step === 1 && <StepUpload />}
      {step === 2 && <StepDetails />}
      {step === 3 && <StepLicensePricing />}
      {step === 4 && <StepReview />}

      {step < 4 && (
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={back} disabled={step === 0} leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Back
          </Button>
          <Button onClick={next} disabled={!canAdvance} rightIcon={<ArrowRight className="h-4 w-4" />}>
            Continue
          </Button>
        </div>
      )}
      {step === 4 && (
        <div className="flex justify-start">
          <Button variant="ghost" onClick={back} leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Back
          </Button>
        </div>
      )}
    </div>
  );
}
