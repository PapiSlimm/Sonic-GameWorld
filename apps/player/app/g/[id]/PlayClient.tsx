'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Swords, WifiOff } from 'lucide-react';
import { Badge, Button, Kbd, Panel, Tabs } from '@sonic-gameworld/ui';
import type { Game, LeaderboardEntry, RealtimeHandle, WorldDocument } from '@sonic-gameworld/gameworld-sdk';
import { getGameWorldClient, withDemoFallback, STUDIO_URL } from '../../../lib/sdk';
import { getDemoGame, getDemoLeaderboard, getDemoWorldDocument } from '../../../lib/demo/data';
import { distance2D, findSpawnPoint } from '../../../lib/engine/worldHelpers';
import { createPlayerRuntime } from '../../../lib/engine/playerRuntime';
import { usePlayerStore } from '../../../lib/store/playerStore';
import { Hud } from '../../../components/play/Hud';
import { Minimap } from '../../../components/play/Minimap';
import { LeaderboardTable } from '../../../components/play/LeaderboardTable';

const PlayViewport = dynamic(() => import('../../../components/play/PlayViewport'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-2 text-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading world…
    </div>
  ),
});

export function PlayClient({ gameId }: { gameId: string }) {
  const [game, setGame] = useState<Game>();
  const [world, setWorld] = useState<WorldDocument>();
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [tab, setTab] = useState<'play' | 'leaderboard'>('play');

  const runtimeRef = useRef(createPlayerRuntime({ x: 0, z: 0, yaw: 0 }));
  const realtimeRef = useRef<RealtimeHandle | null>(null);

  const progress = usePlayerStore((s) => (game ? s.sessions[game.id] : undefined));
  const upsertProgress = usePlayerStore((s) => s.upsertProgress);
  const completeObjective = usePlayerStore((s) => s.completeObjective);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const client = getGameWorldClient();
      const gameR = await withDemoFallback(() => client.games.get(gameId), getDemoGame);
      const worldR = await withDemoFallback(() => client.worlds.getDocument(gameR.data.worldId), getDemoWorldDocument);
      if (cancelled) return;

      const spawnEntity = findSpawnPoint(worldR.data);
      const spawnPos = spawnEntity?.transform.position ?? { x: 0, y: 0, z: 0 };
      runtimeRef.current.set(spawnPos.x, spawnPos.z, 0);

      const activeMission = worldR.data.missions.find((m) => m.state === 'ACTIVE');
      const existing = usePlayerStore.getState().sessions[gameR.data.id];
      upsertProgress({
        gameId: gameR.data.id,
        gameName: gameR.data.name,
        worldId: worldR.data.id,
        health: existing?.health ?? 100,
        maxHealth: 100,
        xp: existing?.xp ?? 0,
        activeMissionId: activeMission?.id,
        activeMissionName: activeMission?.name,
        completedObjectiveIds: existing?.completedObjectiveIds ?? [],
      });

      const isOnline = gameR.online && worldR.online;
      setGame(gameR.data);
      setWorld(worldR.data);
      setOnline(isOnline);

      if (isOnline) {
        try {
          const session = await client.games.createSession(gameR.data.id, { mode: 'FREE_ROAM' });
          const joined = await client.sessions.join(session.id);
          realtimeRef.current = client.connectRealtime([joined.connection.topic], () => {}, {
            token: joined.connection.token,
            reconnect: true,
          });
        } catch {
          // Session/realtime join is best-effort — the play page is fully usable without it.
        }
      }

      const lb = await withDemoFallback(() => client.games.leaderboard(gameR.data.id), getDemoLeaderboard);
      if (!cancelled) setLeaderboard(lb.data);
      if (!cancelled) setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
      realtimeRef.current?.close();
      realtimeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  // REACH-objective auto-complete: walking within range of the objective's target entity
  // marks it done and awards XP. Other objective types (KILL/COLLECT/...) aren't simulated in
  // this MVP viewport — see this app's README.
  useEffect(() => {
    if (!world || !game || !progress?.activeMissionId) return;
    const mission = world.missions.find((m) => m.id === progress.activeMissionId);
    if (!mission) return;
    const completed = progress.completedObjectiveIds;
    const unsubscribe = runtimeRef.current.subscribe(() => {
      const snapshot = runtimeRef.current.getSnapshot();
      for (const objective of mission.objectives) {
        if (objective.type !== 'REACH' || !objective.targetEntityId) continue;
        if (completed.includes(objective.id)) continue;
        const target = world.entities.find((e) => e.id === objective.targetEntityId);
        if (!target) continue;
        if (distance2D(snapshot, target.transform.position) < 14) {
          completeObjective(game.id, objective.id);
        }
      }
    });
    return unsubscribe;
  }, [world, game, progress?.activeMissionId, progress?.completedObjectiveIds, completeObjective]);

  if (loading || !game || !world) {
    return (
      <main className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-3 px-4 py-24 text-muted">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        <p className="font-hud text-xs uppercase tracking-wider">Joining session…</p>
      </main>
    );
  }

  const activeMission = world.missions.find((m) => m.id === progress?.activeMissionId);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-text">{game.name}</h1>
            {!online && (
              <Badge tone="warn" dot>
                <WifiOff className="h-3 w-3" aria-hidden /> Offline demo
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted">
            {world.name} · {game.genre.join(', ')} · {game.playerCount.toLocaleString()} players
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1 font-hud text-[10px] uppercase tracking-wider text-muted sm:flex">
            Move <Kbd>W</Kbd><Kbd>A</Kbd><Kbd>S</Kbd><Kbd>D</Kbd>
          </span>
          {game.modes.includes('RTS') && (
            <a href={`/g/${game.id}/rts`}>
              <Button variant="primary" size="sm" leftIcon={<Swords className="h-3.5 w-3.5" aria-hidden />}>
                Play RTS mode
              </Button>
            </a>
          )}
          <a href={`${STUDIO_URL}/worlds/${world.id}`} target="_blank" rel="noreferrer">
            <Button variant="secondary" size="sm" rightIcon={<ExternalLink className="h-3.5 w-3.5" aria-hidden />}>
              Remix this world
            </Button>
          </a>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'play' | 'leaderboard')}>
        <Tabs.List>
          <Tabs.Trigger value="play">Play</Tabs.Trigger>
          <Tabs.Trigger value="leaderboard">Leaderboard</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="play">
          <div className="relative h-[65vh] min-h-[420px] overflow-hidden rounded-panel border border-border bg-bg">
            <PlayViewport world={world} spawn={runtimeRef.current.getSnapshot()} runtime={runtimeRef.current} />
            <div className="pointer-events-none absolute left-4 top-4">
              <Hud
                health={progress?.health ?? 100}
                maxHealth={progress?.maxHealth ?? 100}
                xp={progress?.xp ?? 0}
                mission={activeMission}
                completedObjectiveIds={progress?.completedObjectiveIds ?? []}
              />
            </div>
            <div className="pointer-events-none absolute bottom-4 right-4">
              <Minimap world={world} runtime={runtimeRef.current} />
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="leaderboard">
          <Panel title="Leaderboard">
            <LeaderboardTable entries={leaderboard} />
          </Panel>
        </Tabs.Content>
      </Tabs>
    </main>
  );
}
