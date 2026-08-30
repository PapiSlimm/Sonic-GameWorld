'use client';

import { useEffect, useState } from 'react';
import type { CreatorProfile, Game, LiveEvent, Mission, NPC, World } from '@sonic-gameworld/gameworld-sdk';
import { getGameWorldClient, withDemoFallback } from '../sdk';
import {
  getDemoCommunities,
  getDemoCreators,
  getDemoGames,
  getDemoLiveEvents,
  getDemoMissions,
  getDemoNPCs,
  getDemoWorlds,
  type CommunityLink,
} from '../demo/data';

export interface DiscoverData {
  games: Game[];
  worlds: World[];
  liveEvents: LiveEvent[];
  missions: Mission[];
  creators: CreatorProfile[];
  npcs: NPC[];
  communities: CommunityLink[];
  loading: boolean;
  /** false once any section had to fall back to offline demo content. */
  online: boolean;
}

const INITIAL: DiscoverData = {
  games: [],
  worlds: [],
  liveEvents: [],
  missions: [],
  creators: [],
  npcs: [],
  communities: getDemoCommunities(),
  loading: true,
  online: true,
};

/**
 * Loads the GameWorld Play discovery home data. Every section is fetched independently and
 * falls back to offline demo content (see `lib/demo/data.ts`) so a single failing endpoint
 * (or no API at all) never blanks out the whole page.
 */
export function useDiscoverData(): DiscoverData {
  const [data, setData] = useState<DiscoverData>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    const client = getGameWorldClient();

    async function load() {
      const [gamesR, worldsR, eventsR, missionsR, creatorsR, npcsR] = await Promise.all([
        withDemoFallback(async () => (await client.games.list({ limit: 12 })).items, getDemoGames),
        withDemoFallback(async () => (await client.worlds.list({ limit: 12, status: 'PUBLISHED' })).items, getDemoWorlds),
        withDemoFallback(async () => (await client.cloud.listLiveEvents({ limit: 12 })).items, getDemoLiveEvents),
        withDemoFallback(async () => (await client.missions.list({ limit: 12 })).items, getDemoMissions),
        withDemoFallback(async () => (await client.marketplace.featured()).creators, getDemoCreators),
        withDemoFallback(async () => (await client.npcs.list({ limit: 12 })).items, getDemoNPCs),
      ]);
      if (cancelled) return;
      setData({
        games: gamesR.data,
        worlds: worldsR.data,
        liveEvents: eventsR.data,
        missions: missionsR.data,
        creators: creatorsR.data,
        npcs: npcsR.data,
        communities: getDemoCommunities(),
        loading: false,
        online: gamesR.online && worldsR.online && eventsR.online && missionsR.online && creatorsR.online && npcsR.online,
      });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}
