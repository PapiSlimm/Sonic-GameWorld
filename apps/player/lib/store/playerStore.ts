'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@sonic-gameworld/gameworld-sdk';

export interface SessionProgress {
  gameId: string;
  gameName: string;
  worldId: string;
  health: number;
  maxHealth: number;
  xp: number;
  activeMissionId?: string;
  activeMissionName?: string;
  completedObjectiveIds: string[];
  updatedAt: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlockedAt: string;
}

interface PlayerPassportState {
  token?: string;
  user?: User;
  /** Most recent play session per game id — powers the Profile "Saves & Progress" tab. */
  sessions: Record<string, SessionProgress>;
  achievements: Achievement[];

  setSession(user?: User, token?: string): void;
  clearSession(): void;

  upsertProgress(progress: Omit<SessionProgress, 'updatedAt'>): void;
  completeObjective(gameId: string, objectiveId: string): void;
  unlockAchievement(achievement: Omit<Achievement, 'unlockedAt'>): void;
}

/**
 * Player passport state, persisted to `localStorage`. `docs/CONTRACTS.md` §9 exposes per-game
 * saves (`GET/PUT /games/:id/saves/:playerId`) but no endpoint to list a player's progress or
 * achievements *across* games, and no achievements API at all — see this app's README
 * ("Cross-package notes"). Local session tracking here is what backs the Profile page's
 * "progress" and "achievements" sections until such endpoints exist.
 */
export const usePlayerStore = create<PlayerPassportState>()(
  persist(
    (set, get) => ({
      token: undefined,
      user: undefined,
      sessions: {},
      achievements: [],

      setSession: (user, token) => set({ user, token }),
      clearSession: () => set({ user: undefined, token: undefined }),

      upsertProgress: (progress) =>
        set((state) => ({
          sessions: {
            ...state.sessions,
            [progress.gameId]: { ...progress, updatedAt: new Date().toISOString() },
          },
        })),

      completeObjective: (gameId, objectiveId) => {
        const session = get().sessions[gameId];
        if (!session || session.completedObjectiveIds.includes(objectiveId)) return;
        set((state) => ({
          sessions: {
            ...state.sessions,
            [gameId]: {
              ...session,
              completedObjectiveIds: [...session.completedObjectiveIds, objectiveId],
              xp: session.xp + 50,
              updatedAt: new Date().toISOString(),
            },
          },
        }));
      },

      unlockAchievement: (achievement) => {
        if (get().achievements.some((a) => a.id === achievement.id)) return;
        set((state) => ({
          achievements: [...state.achievements, { ...achievement, unlockedAt: new Date().toISOString() }],
        }));
      },
    }),
    { name: 'gw-player-passport' },
  ),
);
