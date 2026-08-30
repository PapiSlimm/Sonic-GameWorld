'use client';
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Loader2, ChevronDown } from 'lucide-react';
import { cn } from '../cn.js';

// ---------------- Button ----------------
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-bg hover:bg-accent/90 shadow-glow font-semibold',
  secondary: 'bg-panel text-text border border-border hover:border-accent/60 hover:text-accent',
  ghost: 'bg-transparent text-text/80 hover:bg-panel hover:text-text',
  danger: 'bg-danger text-white hover:bg-danger/90',
  outline: 'bg-transparent text-accent border border-accent/50 hover:bg-accent/10',
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
  icon: 'h-9 w-9 p-0 justify-center',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, leftIcon, rightIcon, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center rounded-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

// ---------------- Panel ----------------
export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  actions?: ReactNode;
  padded?: boolean;
  glow?: boolean;
}

export function Panel({ className, title, actions, padded = true, glow = false, children, ...rest }: PanelProps) {
  return (
    <div className={cn('rounded-panel border border-border bg-panel shadow-panel', glow && 'shadow-glow', className)} {...rest}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="font-hud text-[11px] uppercase tracking-[0.2em] text-muted">{title}</div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(padded && 'p-4')}>{children}</div>
    </div>
  );
}

// ---------------- Badge ----------------
export type BadgeTone = 'default' | 'accent' | 'violet' | 'warn' | 'danger' | 'success' | 'info';
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
}
const badgeTones: Record<BadgeTone, string> = {
  default: 'border-border bg-bg text-text/80',
  accent: 'border-accent/40 bg-accent/10 text-accent',
  violet: 'border-accent2/40 bg-accent2/10 text-accent2',
  warn: 'border-warn/40 bg-warn/10 text-warn',
  danger: 'border-danger/40 bg-danger/10 text-danger',
  success: 'border-success/40 bg-success/10 text-success',
  info: 'border-info/40 bg-info/10 text-info',
};
export function Badge({ className, tone = 'default', dot = false, children, ...rest }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-hud text-[10px] uppercase tracking-wider', badgeTones[tone], className)} {...rest}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current animate-gw-pulse" aria-hidden />}
      {children}
    </span>
  );
}

// ---------------- Input ----------------
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  leftIcon?: ReactNode;
}
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, label, hint, error, leftIcon, id, ...rest }, ref) {
  const inputId = id ?? (typeof label === 'string' ? `in-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  return (
    <label className="flex flex-col gap-1.5 text-sm" htmlFor={inputId}>
      {label && <span className="font-hud text-[11px] uppercase tracking-wider text-muted">{label}</span>}
      <span className="relative flex items-center">
        {leftIcon && <span className="pointer-events-none absolute left-3 text-muted">{leftIcon}</span>}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          className={cn(
            'h-10 w-full rounded-control border border-border bg-bg px-3 text-sm text-text placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50',
            leftIcon && 'pl-9',
            error && 'border-danger focus:border-danger focus:ring-danger/40',
            className,
          )}
          {...rest}
        />
      </span>
      {error ? <span className="text-xs text-danger">{error}</span> : hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
});

// ---------------- Select ----------------
export interface SelectOption { value: string; label: string; disabled?: boolean }
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: ReactNode;
  options: SelectOption[];
  placeholder?: string;
}
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, label, options, placeholder, ...rest }, ref) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      {label && <span className="font-hud text-[11px] uppercase tracking-wider text-muted">{label}</span>}
      <span className="relative flex items-center">
        <select
          ref={ref}
          className={cn('h-10 w-full appearance-none rounded-control border border-border bg-bg px-3 pr-9 text-sm text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50', className)}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-muted" aria-hidden />
      </span>
    </label>
  );
});

// ---------------- Slider ----------------
export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> {
  label?: ReactNode;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  format?: (v: number) => string;
}
export function Slider({ className, label, value, min = 0, max = 100, step = 1, onChange, format, ...rest }: SliderProps) {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  return (
    <label className={cn('flex flex-col gap-1.5 text-sm', className)}>
      {(label || format) && (
        <span className="flex items-center justify-between">
          <span className="font-hud text-[11px] uppercase tracking-wider text-muted">{label}</span>
          <span className="font-hud text-xs text-accent">{format ? format(value) : value}</span>
        </span>
      )}
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange?.(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-accent"
        style={{ background: `linear-gradient(90deg, #38F5C8 ${pct}%, #1B2230 ${pct}%)` }}
        {...rest}
      />
    </label>
  );
}

// ---------------- Toggle ----------------
export interface ToggleProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}
export function Toggle({ checked, onChange, label, disabled, className, size = 'md' }: ToggleProps) {
  const dims = size === 'sm' ? { track: 'h-4 w-7', knob: 'h-3 w-3', on: 'translate-x-3' } : { track: 'h-5 w-9', knob: 'h-4 w-4', on: 'translate-x-4' };
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm', disabled && 'cursor-not-allowed opacity-50', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cn('relative inline-flex shrink-0 items-center rounded-full border border-border transition-colors', dims.track, checked ? 'bg-accent/80' : 'bg-bg')}
      >
        <span className={cn('inline-block rounded-full bg-text transition-transform', dims.knob, 'translate-x-0.5', checked && dims.on)} />
      </button>
      {label && <span className="text-text/90">{label}</span>}
    </label>
  );
}

// ---------------- Kbd ----------------
export function Kbd({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-bg px-1.5 font-hud text-[10px] text-muted', className)} {...rest}>
      {children}
    </kbd>
  );
}

// ---------------- EmptyState ----------------
export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}
export function EmptyState({ icon, title, description, action, className, ...rest }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-border p-10 text-center', className)} {...rest}>
      {icon && <div className="text-accent/70">{icon}</div>}
      <div className="text-base font-medium text-text">{title}</div>
      {description && <div className="max-w-sm text-sm text-muted">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ---------------- StatTile ----------------
export interface StatTileProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  value: ReactNode;
  delta?: number;
  deltaLabel?: string;
  icon?: ReactNode;
  tone?: 'accent' | 'violet' | 'warn' | 'danger' | 'default';
}
export function StatTile({ label, value, delta, deltaLabel, icon, tone = 'default', className, ...rest }: StatTileProps) {
  const toneCls = { accent: 'text-accent', violet: 'text-accent2', warn: 'text-warn', danger: 'text-danger', default: 'text-text' }[tone];
  return (
    <div className={cn('flex flex-col gap-2 rounded-panel border border-border bg-panel p-4', className)} {...rest}>
      <div className="flex items-center justify-between">
        <span className="font-hud text-[11px] uppercase tracking-[0.2em] text-muted">{label}</span>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <div className={cn('font-hud text-2xl font-semibold tabular-nums', toneCls)}>{value}</div>
      {delta !== undefined && (
        <div className={cn('font-hud text-xs', delta >= 0 ? 'text-success' : 'text-danger')}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%{deltaLabel ? <span className="text-muted"> {deltaLabel}</span> : null}
        </div>
      )}
    </div>
  );
}
