'use client';
import { createContext, useContext, useId, useState, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn.js';

interface TabsCtx { value: string; setValue: (v: string) => void; baseId: string }
const TabsContext = createContext<TabsCtx | null>(null);

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
}

export function Tabs({ value, defaultValue, onValueChange, children, className, ...rest }: TabsProps) {
  const [inner, setInner] = useState(defaultValue ?? '');
  const baseId = useId();
  const current = value ?? inner;
  const setValue = (v: string) => {
    if (value === undefined) setInner(v);
    onValueChange?.(v);
  };
  return (
    <TabsContext.Provider value={{ value: current, setValue, baseId }}>
      <div className={cn('flex flex-col gap-3', className)} {...rest}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function useTabs(): TabsCtx {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tabs.* must be used inside <Tabs>');
  return ctx;
}

export function TabsList({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div role="tablist" className={cn('inline-flex items-center gap-1 rounded-control border border-border bg-bg p-1', className)} {...rest}>
      {children}
    </div>
  );
}

export interface TabsTriggerProps extends HTMLAttributes<HTMLButtonElement> { value: string; disabled?: boolean }
export function TabsTrigger({ value, className, children, disabled, ...rest }: TabsTriggerProps) {
  const { value: current, setValue, baseId } = useTabs();
  const active = current === value;
  return (
    <button
      role="tab"
      type="button"
      id={`${baseId}-tab-${value}`}
      aria-selected={active}
      aria-controls={`${baseId}-panel-${value}`}
      disabled={disabled}
      onClick={() => setValue(value)}
      className={cn(
        'rounded-[6px] px-3 py-1.5 font-hud text-[11px] uppercase tracking-wider transition-colors',
        active ? 'bg-panel text-accent shadow-glow' : 'text-muted hover:text-text',
        disabled && 'opacity-40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface TabsContentProps extends HTMLAttributes<HTMLDivElement> { value: string; forceMount?: boolean }
export function TabsContent({ value, className, children, forceMount, ...rest }: TabsContentProps) {
  const { value: current, baseId } = useTabs();
  const active = current === value;
  if (!active && !forceMount) return null;
  return (
    <div role="tabpanel" id={`${baseId}-panel-${value}`} aria-labelledby={`${baseId}-tab-${value}`} hidden={!active} className={cn(className)} {...rest}>
      {children}
    </div>
  );
}

Tabs.List = TabsList;
Tabs.Trigger = TabsTrigger;
Tabs.Content = TabsContent;
