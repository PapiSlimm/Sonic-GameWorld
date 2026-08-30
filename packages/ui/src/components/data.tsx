'use client';
import { useEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { cn, formatCents } from '../cn.js';
import { Kbd } from './primitives.js';

// ---------------- DataTable ----------------
export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render?: (row: T, index: number) => ReactNode;
  accessor?: (row: T) => string | number | boolean | null | undefined;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

export interface DataTableProps<T> extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: ReactNode;
  dense?: boolean;
  loading?: boolean;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, emptyMessage = 'No data', dense = false, loading = false, initialSort, className, ...rest }: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.accessor) return rows;
    const acc = col.accessor;
    return [...rows].sort((a, b) => {
      const av = acc(a);
      const bv = acc(b);
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const r = av < bv ? -1 : 1;
      return sort.dir === 'asc' ? r : -r;
    });
  }, [rows, sort, columns]);

  const toggleSort = (key: string) => {
    setSort((s) => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));
  };

  return (
    <div className={cn('overflow-x-auto rounded-panel border border-border bg-panel', className)} {...rest}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className={cn('px-3 py-2 text-left font-hud text-[10px] uppercase tracking-[0.18em] text-muted', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.className)}
              >
                {c.sortable && c.accessor ? (
                  <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-text">
                    {c.header}
                    {sort?.key === c.key ? (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-50" />}
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center font-hud text-xs text-muted animate-gw-pulse">Loading…</td>
            </tr>
          ) : sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-muted">{emptyMessage}</td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn('border-b border-border/60 last:border-b-0', onRowClick && 'cursor-pointer hover:bg-bg/60')}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-3 text-text/90', dense ? 'py-1.5' : 'py-2.5', c.align === 'right' && 'text-right tabular-nums', c.align === 'center' && 'text-center', c.className)}>
                    {c.render ? c.render(row, i) : String(c.accessor?.(row) ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- PriceTag ----------------
export interface PriceTagProps extends HTMLAttributes<HTMLSpanElement> {
  cents: number;
  currency?: string;
  compareAtCents?: number;
  size?: 'sm' | 'md' | 'lg';
  freeLabel?: string;
}
export function PriceTag({ cents, currency = 'USD', compareAtCents, size = 'md', freeLabel = 'Free', className, ...rest }: PriceTagProps) {
  const sz = { sm: 'text-sm', md: 'text-lg', lg: 'text-2xl' }[size];
  return (
    <span className={cn('inline-flex items-baseline gap-2 font-hud font-semibold tabular-nums text-accent', sz, className)} {...rest}>
      {cents === 0 ? freeLabel : formatCents(cents, currency)}
      {compareAtCents !== undefined && compareAtCents > cents && <span className="text-xs font-normal text-muted line-through">{formatCents(compareAtCents, currency)}</span>}
    </span>
  );
}

// ---------------- LicenseBadge ----------------
export type LicenseStatus = 'GREEN' | 'YELLOW' | 'RED';
export interface LicenseBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: LicenseStatus;
  label?: ReactNode;
  reasons?: string[];
}
const licenseTone: Record<LicenseStatus, { cls: string; icon: ReactNode; text: string }> = {
  GREEN: { cls: 'border-success/40 bg-success/10 text-success', icon: <ShieldCheck className="h-3.5 w-3.5" />, text: 'Compatible' },
  YELLOW: { cls: 'border-warn/40 bg-warn/10 text-warn', icon: <ShieldQuestion className="h-3.5 w-3.5" />, text: 'Check terms' },
  RED: { cls: 'border-danger/40 bg-danger/10 text-danger', icon: <ShieldAlert className="h-3.5 w-3.5" />, text: 'Incompatible' },
};
export function LicenseBadge({ status, label, reasons, className, ...rest }: LicenseBadgeProps) {
  const t = licenseTone[status];
  return (
    <span title={reasons?.join('\n')} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-hud text-[10px] uppercase tracking-wider', t.cls, className)} {...rest}>
      {t.icon}
      {label ?? t.text}
    </span>
  );
}

// ---------------- ScoreRing ----------------
export interface ScoreRingProps extends HTMLAttributes<HTMLDivElement> {
  /** 0..100 */
  value: number;
  size?: number;
  stroke?: number;
  label?: ReactNode;
  tone?: 'accent' | 'violet' | 'auto';
}
export function ScoreRing({ value, size = 96, stroke = 8, label, tone = 'auto', className, ...rest }: ScoreRingProps) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = tone === 'accent' ? '#38F5C8' : tone === 'violet' ? '#7C5CFF' : v >= 75 ? '#38F5C8' : v >= 45 ? '#FFB020' : '#FF4D6D';
  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }} role="meter" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} {...rest}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#1B2230" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * v) / 100} style={{ transition: 'stroke-dashoffset 600ms ease', filter: `drop-shadow(0 0 6px ${color}88)` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-hud font-semibold tabular-nums text-text" style={{ fontSize: size / 4 }}>{Math.round(v)}</span>
        {label && <span className="font-hud text-[9px] uppercase tracking-wider text-muted">{label}</span>}
      </div>
    </div>
  );
}

// ---------------- CommandPalette ----------------
export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  group?: string;
  keywords?: string[];
  icon?: ReactNode;
  shortcut?: string[];
  onSelect: () => void;
}
export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
  placeholder?: string;
  /** Free-text submit (e.g. AI Director command) when no item matches or user presses Enter with a prefix. */
  onSubmitText?: (text: string) => void;
  freeTextLabel?: string;
}

export function CommandPalette({ open, onClose, items, placeholder = 'Type a command…', onSubmitText, freeTextLabel = 'Send to AI Director' }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => [i.label, i.hint ?? '', i.group ?? '', ...(i.keywords ?? [])].some((s) => s.toLowerCase().includes(q)));
  }, [items, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);
  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const run = (item: CommandItem | undefined) => {
    if (item) {
      item.onSelect();
      onClose();
    } else if (onSubmitText && query.trim()) {
      onSubmitText(query.trim());
      onClose();
    }
  };

  const groups = new Map<string, CommandItem[]>();
  for (const i of filtered) {
    const g = i.group ?? 'Commands';
    groups.set(g, [...(groups.get(g) ?? []), i]);
  }
  let flatIndex = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="w-full max-w-xl overflow-hidden rounded-panel border border-border bg-panel shadow-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, Math.max(filtered.length - 1, 0)));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(filtered[active]);
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder={placeholder}
            className="h-12 flex-1 bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
          />
          <Kbd>ESC</Kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 && !onSubmitText && <div className="px-4 py-6 text-center text-sm text-muted">No matches</div>}
          {Array.from(groups.entries()).map(([group, list]) => (
            <div key={group}>
              <div className="px-4 pb-1 pt-2 font-hud text-[10px] uppercase tracking-[0.2em] text-muted">{group}</div>
              {list.map((item) => {
                flatIndex += 1;
                const idx = flatIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => run(item)}
                    className={cn('flex w-full items-center gap-3 px-4 py-2 text-left text-sm', idx === active ? 'bg-bg text-accent' : 'text-text/90')}
                  >
                    {item.icon && <span className="text-muted">{item.icon}</span>}
                    <span className="flex-1">
                      {item.label}
                      {item.hint && <span className="ml-2 text-xs text-muted">{item.hint}</span>}
                    </span>
                    {item.shortcut && <span className="flex gap-1">{item.shortcut.map((k) => <Kbd key={k}>{k}</Kbd>)}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {onSubmitText && query.trim() && (
            <button type="button" onClick={() => run(undefined)} className="mt-1 flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-left text-sm text-accent2 hover:bg-bg">
              ▶ {freeTextLabel}: <span className="text-text/80">“{query.trim()}”</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Hook: opens the palette on Cmd/Ctrl+K. */
export function useCommandPalette(): { open: boolean; setOpen: (v: boolean) => void } {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return { open, setOpen };
}
