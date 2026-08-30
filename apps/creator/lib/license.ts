import type { LicenseRecord } from '@sonic-gameworld/gameworld-sdk';
import { LICENSE_FLAG_ORDER, type LicenseFlagKey, type LicenseFormState } from './types';

/** A conservative starting point: personal use, modifiable, nothing else granted. */
export function defaultLicenseFormState(): LicenseFormState {
  const flags = Object.fromEntries(LICENSE_FLAG_ORDER.map((k) => [k, false])) as Record<LicenseFlagKey, boolean>;
  flags.personal = true;
  flags.modification = true;
  return { flags, attributionText: '', seats: null, spdx: '' };
}

/**
 * Publish-wizard License Builder → `LicenseRecord` mapping (CONTRACTS §6).
 *
 * Pure and deterministic so it is trivial to unit test: given the 10 boolean flags + attribution
 * text + seat count from the wizard's form state, produce the `LicenseRecord` sent to
 * `POST /v1/products` (`CreateProductInput.license`).
 *
 * - `id` is derived from `productId` (`lic_<productId>`) when provided, else a placeholder the
 *   API is expected to replace with the real license id on creation.
 * - `attributionText` / `spdx` are omitted entirely (not sent as empty strings) when blank, and
 *   `seats` is omitted unless a positive integer was set — matching the optional fields on
 *   `LicenseRecordSchema`.
 * - When `attribution` is off, any `attributionText` typed into the form is dropped rather than
 *   sent, since the flag governs whether it applies.
 */
export function buildLicenseRecord(form: LicenseFormState, productId?: string): LicenseRecord {
  const record: LicenseRecord = {
    id: productId ? `lic_${productId}` : 'lic_pending',
    commercial: form.flags.commercial,
    personal: form.flags.personal,
    enterprise: form.flags.enterprise,
    redistribution: form.flags.redistribution,
    modification: form.flags.modification,
    multiplayer: form.flags.multiplayer,
    aiTraining: form.flags.aiTraining,
    resale: form.flags.resale,
    sublicensing: form.flags.sublicensing,
    attribution: form.flags.attribution,
  };

  const attributionText = form.attributionText.trim();
  if (form.flags.attribution && attributionText.length > 0) {
    record.attributionText = attributionText;
  }
  if (form.seats !== null && Number.isFinite(form.seats) && form.seats > 0) {
    record.seats = Math.floor(form.seats);
  }
  const spdx = form.spdx.trim();
  if (spdx.length > 0) {
    record.spdx = spdx;
  }
  return record;
}

/** Human-readable summary lines for the wizard's Review step and the LicenseBadge tooltip. */
export function summarizeLicense(record: LicenseRecord): string[] {
  const lines: string[] = [];
  const grants = LICENSE_FLAG_ORDER.filter((k) => k !== 'attribution' && record[k]);
  const denies = LICENSE_FLAG_ORDER.filter((k) => k !== 'attribution' && !record[k]);
  if (grants.length > 0) lines.push(`Grants: ${grants.join(', ')}`);
  if (denies.length > 0) lines.push(`Denies: ${denies.join(', ')}`);
  if (record.attribution) lines.push(`Attribution required${record.attributionText ? `: "${record.attributionText}"` : ''}`);
  if (record.seats) lines.push(`Seats: ${record.seats}`);
  if (record.spdx) lines.push(`SPDX: ${record.spdx}`);
  return lines;
}
