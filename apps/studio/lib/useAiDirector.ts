'use client';

import { useCallback, useEffect } from 'react';
import type { AIAgentRole } from '@sonic-gameworld/gameworld-sdk';
import { getClient } from './client';
import { runLocalAICommand } from './localAi';
import { useCommandRegistry } from './commandRegistry';
import { useStudioStore } from './store';

export interface UseAiDirectorOptions {
  worldId: string;
  mode?: AIAgentRole;
}

/**
 * Wires the AI Director command bar to either the live `/v1/ai/command` endpoint or the offline
 * deterministic fallback (`runLocalAICommand`), logging plan → tool executions → denials →
 * narration into the studio store, and registers itself as the command palette's free-text
 * handler so ⌘K can also talk to the AI Director.
 */
export function useAiDirector({ worldId, mode = 'BUILDER' }: UseAiDirectorOptions) {
  const offline = useStudioStore((s) => s.offline);
  const document = useStudioStore((s) => s.document);
  const selection = useStudioStore((s) => s.selection);
  const worldMeta = useStudioStore((s) => s.worldMeta);
  const commitDocument = useStudioStore((s) => s.commitDocument);
  const pushLog = useStudioStore((s) => s.pushLog);
  const setAiBusy = useStudioStore((s) => s.setAiBusy);
  const setAiSubmit = useCommandRegistry((s) => s.setAiSubmit);

  const submit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !document) return;
      setAiBusy(true);
      pushLog({ kind: 'plan', text: trimmed, role: mode });

      const applyLocal = () => {
        const result = runLocalAICommand(trimmed, document, { selectedEntityId: selection[0], actor: worldMeta?.ownerId });
        if (!result.plan.toolCalls.length && !result.executed.length && !result.denied.length) return;
        if (result.executed.length) commitDocument(result.document, `AI Director: ${trimmed}`);
        for (const exec of result.executed) {
          pushLog({ kind: 'executed', tool: exec.tool, role: exec.role, ok: exec.ok, text: `${exec.tool} → ${exec.ok ? 'done' : exec.error ?? 'failed'} (${exec.durationMs}ms)`, raw: exec });
        }
        for (const d of result.denied) {
          pushLog({ kind: 'denied', tool: d.tool, ok: false, text: `${d.tool} denied (${d.code}): ${d.reason}`, raw: d });
        }
        if (result.narration) pushLog({ kind: 'narration', text: result.narration });
      };

      if (offline) {
        applyLocal();
        setAiBusy(false);
        return;
      }

      try {
        const client = getClient();
        const res = await client.ai.command({ worldId, text: trimmed, mode });
        for (const exec of res.executed) {
          pushLog({ kind: 'executed', tool: exec.tool, role: exec.role, ok: exec.ok, text: `${exec.tool} → ${exec.ok ? 'done' : exec.error ?? 'failed'} (${exec.durationMs}ms)`, raw: exec });
        }
        for (const d of res.denied) {
          pushLog({ kind: 'denied', tool: d.tool, ok: false, text: `${d.tool} denied (${d.code}): ${d.reason}`, raw: d });
        }
        if (res.narration) pushLog({ kind: 'narration', text: res.narration });
        // Document mutations land via the world:<id> realtime subscription (mergeRemotePatch).
      } catch (err) {
        pushLog({ kind: 'system', text: `AI service unreachable, falling back to the offline director (${err instanceof Error ? err.message : 'network error'}).` });
        applyLocal();
      } finally {
        setAiBusy(false);
      }
    },
    [document, offline, worldId, mode, selection, worldMeta, commitDocument, pushLog, setAiBusy],
  );

  useEffect(() => {
    setAiSubmit((t: string) => void submit(t));
    return () => setAiSubmit(null);
  }, [submit, setAiSubmit]);

  return { submit };
}
