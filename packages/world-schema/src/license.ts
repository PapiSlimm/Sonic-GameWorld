import type { LicenseRecord } from './schema.js';

export type LicenseCompatibility = 'GREEN' | 'YELLOW' | 'RED';

export interface LicenseIntent {
  commercial: boolean;
  multiplayer: boolean;
  redistribute: boolean;
  modify: boolean;
  /** Optional extras evaluated when present. */
  aiTraining?: boolean;
  resale?: boolean;
  sublicense?: boolean;
  enterprise?: boolean;
  seats?: number;
}

export interface LicenseCompatibilityResult {
  status: LicenseCompatibility;
  reasons: string[];
  /** Per-license breakdown for UIs. */
  details: { licenseId: string; status: LicenseCompatibility; reasons: string[] }[];
}

const worse = (a: LicenseCompatibility, b: LicenseCompatibility): LicenseCompatibility => {
  const rank: Record<LicenseCompatibility, number> = { GREEN: 0, YELLOW: 1, RED: 2 };
  return rank[a] >= rank[b] ? a : b;
};

function evaluateOne(license: LicenseRecord, intent: LicenseIntent): { status: LicenseCompatibility; reasons: string[] } {
  const reasons: string[] = [];
  let status: LicenseCompatibility = 'GREEN';
  const label = license.spdx ? `${license.id} (${license.spdx})` : license.id;

  // Hard blockers → RED
  if (intent.commercial && !license.commercial) {
    status = 'RED';
    reasons.push(`${label}: commercial use is not permitted`);
  }
  if (!intent.commercial && !license.personal && !license.commercial) {
    status = 'RED';
    reasons.push(`${label}: neither personal nor commercial use is permitted`);
  }
  if (intent.redistribute && !license.redistribution) {
    status = 'RED';
    reasons.push(`${label}: redistribution is not permitted`);
  }
  if (intent.modify && !license.modification) {
    status = 'RED';
    reasons.push(`${label}: modification is not permitted`);
  }
  if (intent.resale && !license.resale) {
    status = 'RED';
    reasons.push(`${label}: resale is not permitted`);
  }
  if (intent.sublicense && !license.sublicensing) {
    status = 'RED';
    reasons.push(`${label}: sublicensing is not permitted`);
  }
  if (intent.enterprise && !license.enterprise) {
    status = 'RED';
    reasons.push(`${label}: enterprise use is not permitted`);
  }
  if (intent.aiTraining && !license.aiTraining) {
    status = 'RED';
    reasons.push(`${label}: AI training is not permitted`);
  }

  // Soft warnings → YELLOW
  if (intent.multiplayer && !license.multiplayer) {
    status = worse(status, 'YELLOW');
    reasons.push(`${label}: multiplayer use is not explicitly granted — confirm with the creator`);
  }
  if (license.attribution) {
    status = worse(status, 'YELLOW');
    reasons.push(`${label}: attribution required${license.attributionText ? ` ("${license.attributionText}")` : ''}`);
  }
  if (license.seats !== undefined && intent.seats !== undefined && intent.seats > license.seats) {
    status = worse(status, 'YELLOW');
    reasons.push(`${label}: license covers ${license.seats} seat(s), ${intent.seats} requested`);
  }
  if (intent.commercial && license.commercial && !license.personal) {
    // commercial-only licenses are fine for commercial intent; no warning
  }

  return { status, reasons };
}

/**
 * License compatibility engine.
 * GREEN  → every license permits the intent with no caveats.
 * YELLOW → permitted with caveats (attribution, seat limits, unspecified multiplayer).
 * RED    → at least one license forbids the intent.
 */
export function checkLicenseCompatibility(licenses: LicenseRecord[], intent: LicenseIntent): LicenseCompatibilityResult {
  if (licenses.length === 0) {
    return { status: 'GREEN', reasons: ['No third-party licenses to evaluate'], details: [] };
  }
  const details = licenses.map((l) => ({ licenseId: l.id, ...evaluateOne(l, intent) }));
  let status: LicenseCompatibility = 'GREEN';
  const reasons: string[] = [];
  for (const d of details) {
    status = worse(status, d.status);
    reasons.push(...d.reasons);
  }
  // Cross-license conflict: mixing a non-redistributable license into a redistributable bundle
  if (intent.redistribute) {
    const nonRedistributable = licenses.filter((l) => !l.redistribution);
    if (nonRedistributable.length > 0 && nonRedistributable.length < licenses.length) {
      reasons.push(`Bundle mixes redistributable and non-redistributable licenses (${nonRedistributable.map((l) => l.id).join(', ')})`);
    }
  }
  if (status === 'GREEN' && reasons.length === 0) reasons.push('All licenses permit the requested use');
  return { status, reasons, details };
}

/** Common license presets. */
export const LICENSE_PRESETS = {
  STANDARD: (id = 'lic_standard'): LicenseRecord => ({
    id, commercial: true, personal: true, enterprise: false, redistribution: false, modification: true,
    multiplayer: true, aiTraining: false, resale: false, sublicensing: false, attribution: false, spdx: 'LicenseRef-GW-Standard',
  }),
  PERSONAL: (id = 'lic_personal'): LicenseRecord => ({
    id, commercial: false, personal: true, enterprise: false, redistribution: false, modification: true,
    multiplayer: false, aiTraining: false, resale: false, sublicensing: false, attribution: true, attributionText: 'Made with Sonic GameWorld', spdx: 'LicenseRef-GW-Personal',
  }),
  ENTERPRISE: (id = 'lic_enterprise'): LicenseRecord => ({
    id, commercial: true, personal: true, enterprise: true, redistribution: true, modification: true,
    multiplayer: true, aiTraining: false, resale: false, sublicensing: true, attribution: false, seats: 50, spdx: 'LicenseRef-GW-Enterprise',
  }),
  CC_BY: (id = 'lic_cc_by'): LicenseRecord => ({
    id, commercial: true, personal: true, enterprise: true, redistribution: true, modification: true,
    multiplayer: true, aiTraining: true, resale: true, sublicensing: true, attribution: true, attributionText: 'CC BY 4.0', spdx: 'CC-BY-4.0',
  }),
  CC0: (id = 'lic_cc0'): LicenseRecord => ({
    id, commercial: true, personal: true, enterprise: true, redistribution: true, modification: true,
    multiplayer: true, aiTraining: true, resale: true, sublicensing: true, attribution: false, spdx: 'CC0-1.0',
  }),
} as const;
export type LicensePresetName = keyof typeof LICENSE_PRESETS;
