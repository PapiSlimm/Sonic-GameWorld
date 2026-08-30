'use client';
import { create } from 'zustand';
import type { EngineTarget, Genre, ProductCategory } from '@sonic-gameworld/gameworld-sdk';
import { defaultLicenseFormState } from './license';
import type { ProductKind, PublishWizardState } from './types';

export const WIZARD_STEPS = ['Type & category', 'Upload / world', 'Details', 'License & pricing', 'Review & submit'] as const;
export type WizardStepIndex = 0 | 1 | 2 | 3 | 4;

function initialState(): PublishWizardState {
  return {
    kind: 'ASSET',
    category: null,
    assetFileKey: null,
    assetFileName: null,
    assetSizeBytes: null,
    assetId: null,
    worldId: null,
    name: '',
    description: '',
    genre: [],
    engines: [],
    specs: '',
    license: defaultLicenseFormState(),
    priceCents: 0,
  };
}

interface WizardStore {
  step: WizardStepIndex;
  form: PublishWizardState;
  submitting: boolean;
  submitError: string | null;
  setStep: (step: WizardStepIndex) => void;
  next: () => void;
  back: () => void;
  setKind: (kind: ProductKind) => void;
  setCategory: (category: ProductCategory) => void;
  setUpload: (info: { fileKey: string; fileName: string; sizeBytes: number; assetId: string | null }) => void;
  setWorldId: (worldId: string) => void;
  setDetails: (patch: Partial<Pick<PublishWizardState, 'name' | 'description' | 'specs'>>) => void;
  toggleGenre: (g: Genre) => void;
  toggleEngine: (e: EngineTarget) => void;
  setLicenseFlag: (key: keyof PublishWizardState['license']['flags'], value: boolean) => void;
  setLicenseField: (patch: Partial<Pick<PublishWizardState['license'], 'attributionText' | 'seats' | 'spdx'>>) => void;
  setPriceCents: (cents: number) => void;
  setSubmitting: (v: boolean) => void;
  setSubmitError: (msg: string | null) => void;
  reset: () => void;
}

export const useWizardStore = create<WizardStore>((set) => ({
  step: 0,
  form: initialState(),
  submitting: false,
  submitError: null,
  setStep: (step) => set({ step }),
  next: () => set((s) => ({ step: (Math.min(4, s.step + 1) as WizardStepIndex) })),
  back: () => set((s) => ({ step: (Math.max(0, s.step - 1) as WizardStepIndex) })),
  setKind: (kind) => set((s) => ({ form: { ...s.form, kind, assetFileKey: null, assetId: null, worldId: null } })),
  setCategory: (category) => set((s) => ({ form: { ...s.form, category } })),
  setUpload: ({ fileKey, fileName, sizeBytes, assetId }) =>
    set((s) => ({ form: { ...s.form, assetFileKey: fileKey, assetFileName: fileName, assetSizeBytes: sizeBytes, assetId, worldId: null } })),
  setWorldId: (worldId) => set((s) => ({ form: { ...s.form, worldId, assetFileKey: null, assetFileName: null, assetSizeBytes: null, assetId: null } })),
  setDetails: (patch) => set((s) => ({ form: { ...s.form, ...patch } })),
  toggleGenre: (g) =>
    set((s) => ({ form: { ...s.form, genre: s.form.genre.includes(g) ? s.form.genre.filter((x) => x !== g) : [...s.form.genre, g] } })),
  toggleEngine: (e) =>
    set((s) => ({ form: { ...s.form, engines: s.form.engines.includes(e) ? s.form.engines.filter((x) => x !== e) : [...s.form.engines, e] } })),
  setLicenseFlag: (key, value) => set((s) => ({ form: { ...s.form, license: { ...s.form.license, flags: { ...s.form.license.flags, [key]: value } } } })),
  setLicenseField: (patch) => set((s) => ({ form: { ...s.form, license: { ...s.form.license, ...patch } } })),
  setPriceCents: (priceCents) => set((s) => ({ form: { ...s.form, priceCents } })),
  setSubmitting: (submitting) => set({ submitting }),
  setSubmitError: (submitError) => set({ submitError }),
  reset: () => set({ step: 0, form: initialState(), submitting: false, submitError: null }),
}));
