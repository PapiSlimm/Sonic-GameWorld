// License builder: turns a `POST /products` license input (either a named preset, or explicit
// per-flag overrides layered on top of one) into the `LicenseRecord` JSON stored on
// `Product.license`. Pure + unit-testable — no I/O.
import { z } from 'zod';
import { LICENSE_PRESETS, type LicenseRecord, type LicensePresetName } from '@sonic-gameworld/world-schema';

export const LICENSE_PRESET_NAMES = Object.keys(LICENSE_PRESETS) as LicensePresetName[];

export const LicenseBuilderInputSchema = z.object({
  preset: z.enum(LICENSE_PRESET_NAMES as [LicensePresetName, ...LicensePresetName[]]).default('STANDARD'),
  commercial: z.boolean().optional(),
  personal: z.boolean().optional(),
  enterprise: z.boolean().optional(),
  redistribution: z.boolean().optional(),
  modification: z.boolean().optional(),
  multiplayer: z.boolean().optional(),
  aiTraining: z.boolean().optional(),
  resale: z.boolean().optional(),
  sublicensing: z.boolean().optional(),
  attribution: z.boolean().optional(),
  attributionText: z.string().max(500).optional(),
  seats: z.number().int().positive().optional(),
});
export type LicenseBuilderInput = z.infer<typeof LicenseBuilderInputSchema>;

/** Build a full `LicenseRecord` from a preset name plus any explicit flag overrides. */
export function buildLicense(input: LicenseBuilderInput, licenseId: string): LicenseRecord {
  const preset = LICENSE_PRESETS[input.preset](licenseId);
  const record: LicenseRecord = { ...preset };
  for (const key of [
    'commercial',
    'personal',
    'enterprise',
    'redistribution',
    'modification',
    'multiplayer',
    'aiTraining',
    'resale',
    'sublicensing',
    'attribution',
  ] as const) {
    const override = input[key];
    if (override !== undefined) record[key] = override;
  }
  if (input.attributionText !== undefined) record.attributionText = input.attributionText;
  if (input.seats !== undefined) record.seats = input.seats;
  return record;
}
