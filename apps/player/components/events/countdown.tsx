'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@sonic-gameworld/ui';
import type { LiveEvent } from '@sonic-gameworld/gameworld-sdk';

/** Milliseconds remaining until `iso`, clamped to >= 0. Recomputed every render — cheap. */
export function msUntil(iso: string): number {
  return Math.max(0, new Date(iso).getTime() - Date.now());
}

/** Format a millisecond duration as `Dd HH:MM:SS` (dropping the day segment when zero). */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return days > 0 ? `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** Live-ticking milliseconds remaining until `iso` (updates every second on the client). */
export function useCountdown(iso: string): number {
  const [remaining, setRemaining] = useState(() => msUntil(iso));
  useEffect(() => {
    setRemaining(msUntil(iso));
    const id = setInterval(() => setRemaining(msUntil(iso)), 1000);
    return () => clearInterval(id);
  }, [iso]);
  return remaining;
}

export function EventStatusBadge({ status }: { status: LiveEvent['status'] }) {
  if (status === 'LIVE') return <Badge tone="danger" dot>Live</Badge>;
  if (status === 'SCHEDULED') return <Badge tone="accent">Scheduled</Badge>;
  return <Badge tone="default">Ended</Badge>;
}
