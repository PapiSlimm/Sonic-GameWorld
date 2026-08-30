// Pure(-ish) aggregation helpers for the analytics module. Kept separate from the route handlers
// so the shape-building logic is easy to reason about independent of Fastify/Prisma wiring.

export interface TimeseriesPoint {
  t: string;
  value: number;
}

export interface Range {
  from: Date;
  to: Date;
}

export type Granularity = 'HOUR' | 'DAY' | 'WEEK' | 'MONTH';

export function parseRange(query: { from?: string; to?: string }, defaultSpanMs = 7 * 24 * 60 * 60 * 1000): Range {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - defaultSpanMs);
  return { from, to };
}

export function bucketSizeMs(granularity: Granularity = 'DAY'): number {
  switch (granularity) {
    case 'HOUR':
      return 60 * 60 * 1000;
    case 'WEEK':
      return 7 * 24 * 60 * 60 * 1000;
    case 'MONTH':
      return 30 * 24 * 60 * 60 * 1000;
    case 'DAY':
    default:
      return 24 * 60 * 60 * 1000;
  }
}

export interface AnalyticsEventLike {
  name: string;
  timestamp: Date | string;
}

/** Build `{ totals, series }` from a flat list of events: `totals.events` is the grand total,
 * `totals[<name>]` is the per-event-name count, and `series.events` buckets the total count over
 * time at the requested granularity. */
export function buildOverview(events: AnalyticsEventLike[], range: Range, granularity: Granularity = 'DAY'): { totals: Record<string, number>; series: Record<string, TimeseriesPoint[]> } {
  const totals: Record<string, number> = { events: events.length };
  const nameCounts = new Map<string, number>();
  for (const e of events) nameCounts.set(e.name, (nameCounts.get(e.name) ?? 0) + 1);
  for (const [name, count] of nameCounts) totals[name] = count;

  const bucket = bucketSizeMs(granularity);
  const bucketCounts = new Map<number, number>();
  const fromMs = range.from.getTime();
  for (const e of events) {
    const t = new Date(e.timestamp).getTime();
    const key = fromMs + Math.floor((t - fromMs) / bucket) * bucket;
    bucketCounts.set(key, (bucketCounts.get(key) ?? 0) + 1);
  }
  const series = [...bucketCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, value]) => ({ t: new Date(t).toISOString(), value }));

  return { totals, series: { events: series } };
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface RetentionResult {
  d1: number;
  d7: number;
  d30: number;
}

/** Cohort retention from raw join records: a player's cohort day is their first-ever join; Dn is
 * the fraction of the cohort with a join exactly n days after that. */
export function computeRetention(players: Array<{ userId: string; joinedAt: Date | string }>): RetentionResult {
  const firstSeen = new Map<string, Date>();
  const joinDaysByUser = new Map<string, Set<string>>();
  for (const p of players) {
    const joinedAt = new Date(p.joinedAt);
    const existing = firstSeen.get(p.userId);
    if (!existing || joinedAt < existing) firstSeen.set(p.userId, joinedAt);
    const days = joinDaysByUser.get(p.userId) ?? new Set<string>();
    days.add(dayKey(joinedAt));
    joinDaysByUser.set(p.userId, days);
  }
  const cohort = [...firstSeen.entries()];
  if (cohort.length === 0) return { d1: 0, d7: 0, d30: 0 };

  const retainedFraction = (n: number): number => {
    let retained = 0;
    for (const [userId, first] of cohort) {
      const targetDay = dayKey(new Date(first.getTime() + n * 24 * 60 * 60 * 1000));
      if (joinDaysByUser.get(userId)?.has(targetDay)) retained += 1;
    }
    return Math.round((retained / cohort.length) * 1000) / 1000;
  };

  return { d1: retainedFraction(1), d7: retainedFraction(7), d30: retainedFraction(30) };
}

export function averageSessionSeconds(sessions: Array<{ startedAt: Date | string | null; endedAt: Date | string | null }>): number {
  const durations = sessions
    .filter((s) => s.startedAt && s.endedAt)
    .map((s) => (new Date(s.endedAt as string | Date).getTime() - new Date(s.startedAt as string | Date).getTime()) / 1000)
    .filter((d) => d >= 0);
  if (durations.length === 0) return 0;
  return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
}

export function peakConcurrentPlayers(players: Array<{ sessionId: string }>): number {
  const counts = new Map<string, number>();
  for (const p of players) counts.set(p.sessionId, (counts.get(p.sessionId) ?? 0) + 1);
  return counts.size > 0 ? Math.max(...counts.values()) : 0;
}
