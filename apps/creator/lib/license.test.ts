import { describe, expect, it } from 'vitest';
import { buildLicenseRecord, defaultLicenseFormState, summarizeLicense } from './license';
import { LICENSE_FLAG_ORDER } from './types';

describe('license builder -> LicenseRecord mapping', () => {
  it('produces a conservative default record (personal + modification only)', () => {
    const record = buildLicenseRecord(defaultLicenseFormState());
    expect(record.personal).toBe(true);
    expect(record.modification).toBe(true);
    expect(record.commercial).toBe(false);
    expect(record.enterprise).toBe(false);
    expect(record.redistribution).toBe(false);
    expect(record.multiplayer).toBe(false);
    expect(record.aiTraining).toBe(false);
    expect(record.resale).toBe(false);
    expect(record.sublicensing).toBe(false);
    expect(record.attribution).toBe(false);
    expect(record.attributionText).toBeUndefined();
    expect(record.seats).toBeUndefined();
    expect(record.spdx).toBeUndefined();
  });

  it('maps all 10 boolean flags 1:1 in order', () => {
    const form = defaultLicenseFormState();
    for (const key of LICENSE_FLAG_ORDER) form.flags[key] = true;
    const record = buildLicenseRecord(form);
    for (const key of LICENSE_FLAG_ORDER) {
      expect(record[key]).toBe(true);
    }
  });

  it('derives the license id from the product id when provided', () => {
    const record = buildLicenseRecord(defaultLicenseFormState(), 'prod_123');
    expect(record.id).toBe('lic_prod_123');
  });

  it('falls back to a pending id when no product id is provided yet', () => {
    const record = buildLicenseRecord(defaultLicenseFormState());
    expect(record.id).toBe('lic_pending');
  });

  it('only includes attributionText when the attribution flag is on and text is non-blank', () => {
    const form = defaultLicenseFormState();
    form.attributionText = 'Credit: Nova Ando';

    // attribution flag off -> text dropped even though it was typed in
    expect(buildLicenseRecord(form).attributionText).toBeUndefined();

    form.flags.attribution = true;
    expect(buildLicenseRecord(form).attributionText).toBe('Credit: Nova Ando');

    form.attributionText = '   ';
    expect(buildLicenseRecord(form).attributionText).toBeUndefined();
  });

  it('only includes seats when a positive integer was set, and floors fractional input', () => {
    const form = defaultLicenseFormState();
    expect(buildLicenseRecord(form).seats).toBeUndefined();

    form.seats = 0;
    expect(buildLicenseRecord(form).seats).toBeUndefined();

    form.seats = -5;
    expect(buildLicenseRecord(form).seats).toBeUndefined();

    form.seats = 4.9;
    expect(buildLicenseRecord(form).seats).toBe(4);
  });

  it('trims and omits a blank spdx identifier', () => {
    const form = defaultLicenseFormState();
    form.spdx = '  ';
    expect(buildLicenseRecord(form).spdx).toBeUndefined();
    form.spdx = ' CC-BY-4.0 ';
    expect(buildLicenseRecord(form).spdx).toBe('CC-BY-4.0');
  });

  it('summarizes grants, denials and attribution for the review step', () => {
    const form = defaultLicenseFormState();
    form.flags.commercial = true;
    form.flags.attribution = true;
    form.attributionText = 'Credit required';
    form.seats = 10;
    const record = buildLicenseRecord(form);
    const summary = summarizeLicense(record);
    expect(summary.some((l) => l.startsWith('Grants:') && l.includes('commercial') && l.includes('personal'))).toBe(true);
    expect(summary.some((l) => l.startsWith('Denies:') && l.includes('enterprise'))).toBe(true);
    expect(summary.some((l) => l.includes('Attribution required') && l.includes('Credit required'))).toBe(true);
    expect(summary.some((l) => l.includes('Seats: 10'))).toBe(true);
  });
});
