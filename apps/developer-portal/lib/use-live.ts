'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type DataSource = 'live' | 'demo';

export interface UseLiveResult<T> {
  data: T;
  source: DataSource;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Attempts a live API call; on any failure (offline API, no session, endpoint not yet
 * implemented on this deployment) it transparently falls back to the given demo dataset so every
 * developer-portal screen renders a complete UI with zero backend dependency. `source` tells the
 * page (and the DataSourceBadge) which one is currently showing.
 */
export function useLiveOrDemo<T>(fetcher: () => Promise<T>, demo: T, deps: unknown[] = []): UseLiveResult<T> {
  const [data, setData] = useState<T>(demo);
  const [source, setSource] = useState<DataSource>('demo');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const demoRef = useRef(demo);
  demoRef.current = demo;

  const run = useCallback(() => {
    const mine = ++seq.current;
    setLoading(true);
    fetcherRef
      .current()
      .then((result) => {
        if (seq.current !== mine) return;
        setData(result);
        setSource('live');
        setError(null);
      })
      .catch((err: unknown) => {
        if (seq.current !== mine) return;
        setData(demoRef.current);
        setSource('demo');
        setError(err instanceof Error ? err.message : 'Unable to reach the GameWorld API');
      })
      .finally(() => {
        if (seq.current === mine) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  return { data, source, loading, error, reload: run };
}
