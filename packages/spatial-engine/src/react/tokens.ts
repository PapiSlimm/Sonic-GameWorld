import type { CSSProperties } from 'react';

/** Design tokens from CONTRACTS §12 ("command-center" dark aesthetic). Kept local (no CSS/Tailwind
 * dependency) so these overlay components render correctly in any host app without extra setup. */
export const TOKENS = {
  bg: '#05070B',
  panel: '#0B0F17',
  border: '#1B2230',
  accent: '#38F5C8',
  accent2: '#7C5CFF',
  warn: '#FFB020',
  danger: '#FF4D6D',
  text: '#E6EDF3',
  textMuted: '#8892A0',
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
} as const;

export const panelStyle: CSSProperties = {
  background: 'rgba(11, 15, 23, 0.88)',
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 12,
  padding: '10px 14px',
  color: TOKENS.text,
  fontFamily: TOKENS.sans,
  fontSize: 12,
  boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
  backdropFilter: 'blur(6px)',
};

export const headerStyle: CSSProperties = {
  fontFamily: TOKENS.mono,
  fontSize: 10,
  letterSpacing: '0.18em',
  color: TOKENS.textMuted,
  textTransform: 'uppercase',
  marginBottom: 8,
};

export const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 0',
  fontSize: 12,
  cursor: 'pointer',
  color: TOKENS.text,
};

export const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontFamily: TOKENS.mono,
  fontSize: 10,
  letterSpacing: '0.1em',
  color: TOKENS.textMuted,
  textTransform: 'uppercase',
};

export const selectStyle: CSSProperties = {
  background: TOKENS.panel,
  color: TOKENS.text,
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 6,
  padding: '4px 6px',
  fontFamily: TOKENS.sans,
  fontSize: 12,
};

export function buttonStyle(active: boolean): CSSProperties {
  return {
    background: active ? 'rgba(56, 245, 200, 0.16)' : 'transparent',
    color: active ? TOKENS.accent : TOKENS.text,
    border: `1px solid ${active ? TOKENS.accent : TOKENS.border}`,
    borderRadius: 6,
    padding: '5px 10px',
    fontFamily: TOKENS.mono,
    fontSize: 10,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}
