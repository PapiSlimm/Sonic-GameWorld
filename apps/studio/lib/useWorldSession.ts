'use client';

import { useEffect, useRef } from 'react';
import type { WorldDocument } from '@sonic-gameworld/gameworld-sdk';
import { ensureSession, getClient } from './client';
import { getOfflineDocument, saveOfflineDocument } from './offlineStore';
import { documentToWorldMeta } from './offline';
import { subscribeWorld } from './realtime';
import { useStudioStore } from './store';

/**
 * Owns the load → (optional) realtime subscribe → autosave lifecycle for a single world editor
 * session. Tries the live API first; falls back to the browser-persisted offline demo document
 * (seeded from `createSampleWorld('NEON_TOKYO_2099')`) whenever the API is unreachable.
 */
export function useWorldSession(worldId: string): void {
  const loadWorld = useStudioStore((s) => s.loadWorld);
  const setLoading = useStudioStore((s) => s.setLoading);
  const mergeRemotePatch = useStudioStore((s) => s.mergeRemotePatch);
  const document = useStudioStore((s) => s.document);
  const dirty = useStudioStore((s) => s.dirty);
  const offline = useStudioStore((s) => s.offline);
  const markSaved = useStudioStore((s) => s.markSaved);
  const documentRef = useRef<WorldDocument | null>(null);
  documentRef.current = document;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      const online = await ensureSession();
      if (cancelled) return;
      if (online) {
        try {
          const client = getClient();
          const [meta, doc] = await Promise.all([client.worlds.get(worldId), client.worlds.getDocument(worldId)]);
          if (cancelled) return;
          loadWorld(doc as WorldDocument, meta, false);
          return;
        } catch {
          // Fall through to the offline document below (world may not exist server-side yet,
          // or the API flipped unreachable mid-request).
        }
      }
      const doc = getOfflineDocument(worldId);
      if (cancelled) return;
      if (doc) {
        loadWorld(doc, documentToWorldMeta(doc), true);
      } else {
        setLoading(false, `World "${worldId}" was not found (offline demo mode).`);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [worldId, loadWorld, setLoading]);

  // Realtime: merge remote patches for online sessions.
  useEffect(() => {
    if (offline) return undefined;
    const handle = subscribeWorld(worldId, offline, { onPatch: mergeRemotePatch });
    return () => handle?.close();
  }, [worldId, offline, mergeRemotePatch]);

  // Offline autosave: persist edits to localStorage so navigating away and back keeps them.
  useEffect(() => {
    if (!offline || !dirty || !document) return;
    const timer = setTimeout(() => {
      saveOfflineDocument(document);
      markSaved();
    }, 600);
    return () => clearTimeout(timer);
  }, [offline, dirty, document, markSaved]);

  // Online autosave: PUT the document shortly after edits settle.
  useEffect(() => {
    if (offline || !dirty || !document) return;
    const timer = setTimeout(() => {
      getClient()
        .worlds.putDocument(worldId, document)
        .then(() => markSaved())
        .catch(() => {
          /* keep dirty=true so the user can retry / sees the unsaved indicator */
        });
    }, 800);
    return () => clearTimeout(timer);
  }, [offline, dirty, document, worldId, markSaved]);
}
