import type { Config } from 'tailwindcss';

/** Design tokens (CONTRACTS §12) — dark "command-center" aesthetic. */
export const tokens = {
  colors: {
    bg: '#05070B',
    panel: '#0B0F17',
    border: '#1B2230',
    accent: '#38F5C8',
    accent2: '#7C5CFF',
    warn: '#FFB020',
    danger: '#FF4D6D',
    text: '#E6EDF3',
    muted: '#8B98A9',
    success: '#3DDC84',
    info: '#4CC2FF',
  },
  fonts: {
    ui: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
    hud: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
  },
  radius: { panel: '0.75rem', control: '0.5rem' },
} as const;

export type DesignTokens = typeof tokens;

/** Emit tokens as CSS custom properties (for apps that want runtime theming). */
export function tokensToCssVariables(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tokens.colors)) out[`--gw-${k}`] = v;
  out['--gw-font-ui'] = tokens.fonts.ui.join(', ');
  out['--gw-font-hud'] = tokens.fonts.hud.join(', ');
  return out;
}

const preset: Partial<Config> = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: tokens.colors.bg,
        panel: tokens.colors.panel,
        border: tokens.colors.border,
        accent: { DEFAULT: tokens.colors.accent, 2: tokens.colors.accent2 },
        accent2: tokens.colors.accent2,
        warn: tokens.colors.warn,
        danger: tokens.colors.danger,
        text: tokens.colors.text,
        muted: tokens.colors.muted,
        success: tokens.colors.success,
        info: tokens.colors.info,
      },
      fontFamily: {
        sans: [...tokens.fonts.ui],
        ui: [...tokens.fonts.ui],
        hud: [...tokens.fonts.hud],
        mono: [...tokens.fonts.hud],
      },
      borderRadius: { panel: tokens.radius.panel, control: tokens.radius.control },
      boxShadow: {
        glow: `0 0 0 1px ${tokens.colors.accent}33, 0 0 24px ${tokens.colors.accent}33`,
        'glow-violet': `0 0 0 1px ${tokens.colors.accent2}33, 0 0 24px ${tokens.colors.accent2}33`,
        panel: '0 8px 32px rgba(0,0,0,0.45)',
      },
      backgroundImage: {
        grid: `linear-gradient(${tokens.colors.border} 1px, transparent 1px), linear-gradient(90deg, ${tokens.colors.border} 1px, transparent 1px)`,
      },
      backgroundSize: { grid: '32px 32px' },
      keyframes: {
        'gw-pulse': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.45' } },
        'gw-scan': { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(100%)' } },
      },
      animation: { 'gw-pulse': 'gw-pulse 1.6s ease-in-out infinite', 'gw-scan': 'gw-scan 3s linear infinite' },
    },
  },
};

export default preset;
export { preset as gameworldPreset };
