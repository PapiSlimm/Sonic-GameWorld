// CONTENT_POLICY stage heuristics: platform-commerce rules distinct from AI_SAFETY's
// harm-classification concerns — off-platform payment solicitation (fee evasion), contact-info
// leakage (a vector for off-platform scams), and spam shaping (link stuffing, shouting, character
// flooding). All pure regex/statistics, no network calls, so this stage never fails.
import type { ModerationSeverity } from './types.js';

export interface ContentPolicyFinding {
  rule: string;
  detail: string;
  severity: ModerationSeverity;
}

export interface ContentPolicyResult {
  flagged: boolean;
  severity: ModerationSeverity;
  findings: ContentPolicyFinding[];
}

const SEVERITY_RANK: Record<ModerationSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

const OFF_PLATFORM_PAYMENT = /\b(venmo|cashapp|cash app|paypal\.me|zelle|western union)\b.{0,40}(\$|\busd\b|\bdollars?\b)|(\$|\busd\b)\s*\d+.{0,40}\b(venmo|cashapp|cash app|paypal\.me|zelle)\b/i;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i;
const PHONE = /\b(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const URL = /\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+\.[a-z]{2,}/i;
const EXCESSIVE_CAPS = /\b[A-Z]{6,}\b/;
const CHAR_FLOOD = /(.)\1{7,}/; // any character repeated 8+ times in a row

export function scanContentPolicy(text: string): ContentPolicyResult {
  const findings: ContentPolicyFinding[] = [];

  if (OFF_PLATFORM_PAYMENT.test(text)) {
    findings.push({ rule: 'OFF_PLATFORM_PAYMENT', detail: 'Mentions an off-platform payment method alongside a dollar amount — likely fee evasion', severity: 'HIGH' });
  }
  if (EMAIL.test(text)) {
    findings.push({ rule: 'CONTACT_INFO_LEAKAGE', detail: 'Contains an email address', severity: 'MEDIUM' });
  }
  if (PHONE.test(text)) {
    findings.push({ rule: 'CONTACT_INFO_LEAKAGE', detail: 'Contains a phone-number-shaped string', severity: 'MEDIUM' });
  }
  const urlMatches = text.match(new RegExp(URL, 'gi')) ?? [];
  if (urlMatches.length >= 3) {
    findings.push({ rule: 'LINK_STUFFING', detail: `Contains ${urlMatches.length} URLs`, severity: 'MEDIUM' });
  }
  if (CHAR_FLOOD.test(text)) {
    findings.push({ rule: 'SPAM_CHAR_FLOOD', detail: 'Contains a run of 8+ repeated characters', severity: 'LOW' });
  }
  const words = text.split(/\s+/).filter(Boolean);
  const shoutingWords = words.filter((w) => EXCESSIVE_CAPS.test(w)).length;
  if (words.length >= 8 && shoutingWords / words.length > 0.5) {
    findings.push({ rule: 'EXCESSIVE_SHOUTING', detail: `${shoutingWords}/${words.length} words are all-caps`, severity: 'LOW' });
  }

  let severity: ModerationSeverity = 'LOW';
  for (const f of findings) if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[severity]) severity = f.severity;

  return { flagged: findings.length > 0, severity: findings.length > 0 ? severity : 'LOW', findings };
}
