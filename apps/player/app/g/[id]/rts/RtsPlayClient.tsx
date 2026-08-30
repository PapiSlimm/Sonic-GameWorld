'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Loader2, LogIn, WifiOff } from 'lucide-react';
import { Button, EmptyState } from '@sonic-gameworld/ui';
import type { Game, RealtimeHandle, RealtimeMessage, RtsMatchStartPayload } from '@sonic-gameworld/gameworld-sdk';
import type { RTSCommand, RTSMatchState, UnitClass } from '@sonic-gameworld/rts-sim';
import { getGameWorldClient } from '../../../../lib/sdk';
import { usePlayerStore } from '../../../../lib/store/playerStore';
import { useRtsStore, receiveRemoteStateHash } from '../../../../lib/rts/store';
import { createRtsViewportRuntime, type RtsViewportRuntime } from '../../../../lib/rts/viewportRuntime';
import { buildProductionCommand } from '../../../../lib/rts/commands';
import { RtsLobby } from '../../../../components/rts/RtsLobby';
import { RtsMinimap } from '../../../../components/rts/RtsMinimap';
import { RtsProductionPanel } from '../../../../components/rts/RtsProductionPanel';
import { RtsUnitOverlay } from '../../../../components/rts/RtsUnitOverlay';
import { RtsHud } from '../../../../components/rts/RtsHud';

const RtsViewport = dynamic(() => import('../../../../components/rts/RtsViewport').then((m) => m.RtsViewport), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-2 text-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading battlefield…
    </div>
  ),
});

const LOBBY_POLL_MS = 2000;

/**
 * Page-level RTS orchestrator (docs/RTS-CONTRACTS.md §7): creates or joins an RTS session over
 * the SDK, opens the `session:<id>` realtime relay, dispatches incoming messages into
 * `useRtsStore`, drains the store's outbox onto that same connection every animation frame, and
 * composes the lobby screen / battlefield HUD around `RtsViewport`.
 *
 * RTS play is online-only — unlike `PlayClient.tsx`'s FREE_ROAM mode, there is no offline demo
 * fallback here: a lockstep match has no meaning without a live seed authority + command relay.
 */
export function RtsPlayClient({ gameId }: { gameId: string }) {
  const searchParams = useSearchParams();
  const joinSessionId = searchParams.get('join') ?? undefined;

  const user = usePlayerStore((s) => s.user);
  const token = usePlayerStore((s) => s.token);

  const [game, setGame] = useState<Game>();
  const [loadError, setLoadError] = useState<string>();
  const [lobbyBusy, setLobbyBusy] = useState(false);
  const [lobbyError, setLobbyError] = useState<string>();

  const phase = useRtsStore((s) => s.phase);
  const session = useRtsStore((s) => s.session);
  const lobby = useRtsStore((s) => s.lobby);
  const match = useRtsStore((s) => s.match);
  const localFactionId = useRtsStore((s) => s.localFactionId);
  const isHost = useRtsStore((s) => s.isHost);
  const selectedUnitIds = useRtsStore((s) => s.selectedUnitIds);
  const possessedUnitId = useRtsStore((s) => s.possessedUnitId);
  const desynced = useRtsStore((s) => s.desynced);
  const possess = useRtsStore((s) => s.possess);
  const issueCommand = useRtsStore((s) => s.issueCommand);

  const runtimeRef = useRef(createRtsViewportRuntime());
  const realtimeRef = useRef<RealtimeHandle | null>(null);

  // ---- session setup: create/join the RTS lobby, open the realtime relay ----
  useEffect(() => {
    if (!user || !token) return;
    let cancelled = false;
    const client = getGameWorldClient();

    async function setup() {
      try {
        const gameR = await client.games.get(gameId);
        if (cancelled) return;
        setGame(gameR);

        const result = joinSessionId ? await client.sessions.rtsJoin(joinSessionId) : await client.games.createRtsSession(gameId, {});
        if (cancelled) return;
        useRtsStore.getState().enterLobby(gameId, result.session, result.rts, user!.id);

        const topic = `session:${result.session.id}`;
        realtimeRef.current = client.connectRealtime([topic], onRealtimeMessage, { token, reconnect: true });
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not reach the GameWorld API — RTS play requires an online connection.');
      }
    }

    function onRealtimeMessage(msg: RealtimeMessage) {
      const store = useRtsStore.getState();
      const localUserId = usePlayerStore.getState().user?.id;
      switch (msg.type) {
        case 'RTS_MATCH_START': {
          if (localUserId) store.startMatch(msg.payload as RtsMatchStartPayload, localUserId);
          break;
        }
        case 'RTS_COMMAND': {
          const { tick, command } = msg.payload as { tick: number; command: RTSCommand };
          store.receiveRemoteCommand(tick, command);
          break;
        }
        case 'RTS_STATE_HASH': {
          const { tick, hash } = msg.payload as { tick: number; hash: string };
          receiveRemoteStateHash(tick, hash);
          break;
        }
        case 'RTS_SNAPSHOT': {
          const { state } = msg.payload as { tick: number; state: string };
          store.applySnapshot(state);
          break;
        }
        default:
          break;
      }
    }

    void setup();
    return () => {
      cancelled = true;
      realtimeRef.current?.close();
      realtimeRef.current = null;
      useRtsStore.getState().reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, joinSessionId, user?.id, token]);

  // ---- lobby polling: pick up other players' faction/ready changes (no dedicated realtime event
  // for this — only RTS_MATCH_START is broadcast, see docs/RTS-CONTRACTS.md §5) ----
  useEffect(() => {
    if (phase !== 'LOBBY' || !session) return;
    const client = getGameWorldClient();
    const interval = setInterval(async () => {
      try {
        const rts = await client.sessions.getRts(session.id);
        useRtsStore.getState().updateLobby(session, rts);
      } catch {
        // best-effort — a missed poll just tries again next tick
      }
    }, LOBBY_POLL_MS);
    return () => clearInterval(interval);
  }, [phase, session]);

  // ---- drain the store's outbound message queue onto the realtime connection every frame ----
  useEffect(() => {
    if (phase !== 'PLAYING') return;
    let rafHandle = 0;
    const loop = () => {
      const outbox = useRtsStore.getState().drainOutbox();
      for (const msg of outbox) realtimeRef.current?.publish(`session:${session?.id}`, msg.type, msg.payload);
      rafHandle = requestAnimationFrame(loop);
    };
    rafHandle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafHandle);
  }, [phase, session?.id]);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined' || !session) return '';
    return `${window.location.origin}${window.location.pathname}?join=${session.id}`;
  }, [session]);

  async function handleJoinFaction(factionId: string) {
    if (!session) return;
    setLobbyBusy(true);
    setLobbyError(undefined);
    try {
      const client = getGameWorldClient();
      const result = await client.sessions.rtsJoin(session.id, { factionId });
      useRtsStore.getState().updateLobby(result.session, result.rts);
    } catch (err) {
      setLobbyError(err instanceof Error ? err.message : 'Could not join that faction.');
    } finally {
      setLobbyBusy(false);
    }
  }

  async function handleReady() {
    if (!session) return;
    setLobbyBusy(true);
    setLobbyError(undefined);
    try {
      const client = getGameWorldClient();
      const result = await client.sessions.rtsReady(session.id);
      useRtsStore.getState().updateLobby(result.session, result.rts);
      // If everyone is now ready, the server also fires `RTS_MATCH_START` on the realtime relay
      // (handled by `onRealtimeMessage` above) — that's the single source of truth for actually
      // starting the match, so every peer (including this one) begins from the identical seed at
      // the identical moment rather than this client jumping ahead of the broadcast.
    } catch (err) {
      setLobbyError(err instanceof Error ? err.message : 'Could not ready up.');
    } finally {
      setLobbyBusy(false);
    }
  }

  function handleEnqueueProduction(buildingId: string, unitClass: UnitClass) {
    issueCommand(buildProductionCommand(buildingId, unitClass));
  }

  if (!user || !token) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24">
        <EmptyState
          icon={<LogIn className="h-8 w-8" aria-hidden />}
          title="Sign in to play Global Dominance"
          description="RTS matches are tied to your GameWorld account so your faction and progress carry over."
          action={
            <a href="/profile">
              <Button variant="primary">Go to sign in</Button>
            </a>
          }
        />
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24">
        <EmptyState icon={<WifiOff className="h-8 w-8" aria-hidden />} title="Couldn't reach GameWorld" description={loadError} />
      </main>
    );
  }

  if (phase === 'LOBBY' || !game || !session || !lobby) {
    if (!game || !session || !lobby) {
      return (
        <main className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-3 px-4 py-24 text-muted">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          <p className="font-hud text-xs uppercase tracking-wider">{joinSessionId ? 'Joining match…' : 'Creating match…'}</p>
        </main>
      );
    }
    return (
      <RtsLobby
        gameName={game.name}
        session={session}
        lobby={lobby}
        localUserId={user.id}
        isHost={isHost}
        busy={lobbyBusy}
        error={lobbyError}
        shareUrl={shareUrl}
        onJoinFaction={handleJoinFaction}
        onReady={handleReady}
      />
    );
  }

  if (!match) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-3 px-4 py-24 text-muted">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        <p className="font-hud text-xs uppercase tracking-wider">Synchronizing match…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-[calc(100vh-2rem)] max-w-[1600px] flex-col gap-2 px-4 py-4">
      <div className="relative flex-1 overflow-hidden rounded-panel border border-border bg-bg">
        <RtsViewport mapWidthM={match.map.widthM} mapDepthM={match.map.depthM} ownerId={user.id} runtime={runtimeRef.current} />
        <div className="pointer-events-none absolute inset-0">
          <RtsUnitOverlay runtime={runtimeRef.current} />
        </div>
        <div className="pointer-events-none absolute inset-0">
          <RtsHud
            match={match}
            localFactionId={localFactionId}
            selectedUnitIds={selectedUnitIds}
            possessedUnitId={possessedUnitId}
            desynced={desynced}
            onPossess={(unitId) => possess(unitId)}
            onReleasePossession={() => possess(null)}
          />
        </div>
        <div className="pointer-events-auto absolute bottom-4 left-4">
          <RtsMinimapConnected match={match} runtime={runtimeRef.current} />
        </div>
        {localFactionId && (
          <div className="pointer-events-auto absolute bottom-4 right-4">
            <RtsProductionPanel match={match} localFactionId={localFactionId} onEnqueue={handleEnqueueProduction} />
          </div>
        )}
      </div>
    </main>
  );
}

/** Thin wrapper subscribing the minimap to the viewport runtime's `camera` field only, and wiring
 * "click to recenter" through `requestJumpTo` (see `lib/rts/viewportRuntime.ts`). */
function RtsMinimapConnected({ match, runtime }: { match: RTSMatchState; runtime: RtsViewportRuntime }) {
  const [camera, setCamera] = useState(runtime.getSnapshot().camera);
  useEffect(() => runtime.subscribe(() => setCamera(runtime.getSnapshot().camera)), [runtime]);
  return <RtsMinimap match={match} camera={camera} onJumpTo={(x, z) => runtime.requestJumpTo(x, z)} />;
}

export default RtsPlayClient;
