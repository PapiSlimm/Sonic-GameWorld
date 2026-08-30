import { describe, expect, it } from 'vitest';
import { scanContentPolicy } from './contentPolicy.js';

describe('scanContentPolicy', () => {
  it('does not flag ordinary product copy', () => {
    const result = scanContentPolicy('A low-poly medieval castle kit with 12 modular wall pieces and 4 towers. Great for RPG worlds.');
    expect(result.flagged).toBe(false);
  });

  it('flags off-platform payment solicitation', () => {
    const result = scanContentPolicy('Message me on Venmo for a discount, just send $20 directly and skip the marketplace fee.');
    expect(result.flagged).toBe(true);
    expect(result.findings.some((f) => f.rule === 'OFF_PLATFORM_PAYMENT')).toBe(true);
    expect(result.severity).toBe('HIGH');
  });

  it('flags contact-info leakage (email)', () => {
    const result = scanContentPolicy('Contact me directly at seller@example.com for custom commissions.');
    expect(result.flagged).toBe(true);
    expect(result.findings.some((f) => f.rule === 'CONTACT_INFO_LEAKAGE')).toBe(true);
  });

  it('flags link stuffing', () => {
    const result = scanContentPolicy('Check http://a.com http://b.com http://c.com http://d.com for more assets!');
    expect(result.findings.some((f) => f.rule === 'LINK_STUFFING')).toBe(true);
  });

  it('flags spam character flooding', () => {
    const result = scanContentPolicy('BUY NOW!!!!!!!!!!!!!!!!!');
    expect(result.findings.some((f) => f.rule === 'SPAM_CHAR_FLOOD')).toBe(true);
  });
});
