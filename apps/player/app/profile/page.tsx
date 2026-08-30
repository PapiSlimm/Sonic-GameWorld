'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Award, LogOut, Trophy, User2 } from 'lucide-react';
import { Badge, Button, EmptyState, Input, Panel, StatTile, Tabs, useToast } from '@sonic-gameworld/ui';
import type { LibraryItem } from '@sonic-gameworld/gameworld-sdk';
import { getGameWorldClient, setStoredToken, withDemoFallback } from '../../lib/sdk';
import { getDemoLibrary } from '../../lib/demo/data';
import { usePlayerStore, type Achievement, type SessionProgress } from '../../lib/store/playerStore';

const MILESTONES: { threshold: number; achievement: Omit<Achievement, 'unlockedAt'> }[] = [
  { threshold: 1, achievement: { id: 'ach_first_objective', title: 'First Steps', description: 'Complete your first mission objective.' } },
  { threshold: 3, achievement: { id: 'ach_three_objectives', title: 'Getting Warmed Up', description: 'Complete 3 mission objectives.' } },
  { threshold: 6, achievement: { id: 'ach_six_objectives', title: 'Mission Runner', description: 'Complete 6 mission objectives across your sessions.' } },
];

function SignInCard() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const setSession = usePlayerStore((s) => s.setSession);
  const { push } = useToast();

  async function signIn() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const client = getGameWorldClient();
      const auth = await client.auth.dev({ email: email.trim() });
      setStoredToken(auth.tokens.accessToken);
      setSession(auth.user, auth.tokens.accessToken);
      push({ title: 'Signed in', description: `Welcome, ${auth.user.displayName}.`, tone: 'success' });
    } catch {
      push({ title: 'Sign-in unavailable', description: 'services/api is unreachable — dev login needs a running API.', tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Sign in" className="max-w-md">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Dev login (per docs/CONTRACTS.md §3 — disabled in production) creates or signs into an account by email, no
          password needed.
        </p>
        <Input label="Email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button onClick={signIn} loading={busy} disabled={!email.trim()}>Sign in</Button>
      </div>
    </Panel>
  );
}

function ProgressTab() {
  const sessions = usePlayerStore((s) => s.sessions);
  const list = Object.values(sessions) as SessionProgress[];
  if (list.length === 0) {
    return <EmptyState title="No sessions yet" description="Play a game from the Discover page to start building your passport." action={<Link href="/"><Button size="sm">Discover games</Button></Link>} />;
  }
  return (
    <div className="flex flex-col gap-3">
      {list.map((s) => (
        <Panel key={s.gameId} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-text">{s.gameName}</div>
            <div className="font-hud text-[11px] text-muted">Last played {new Date(s.updatedAt).toLocaleString()}</div>
            {s.activeMissionName && <div className="mt-1 text-xs text-text/70">Mission: {s.activeMissionName} · {s.completedObjectiveIds.length} objective(s) complete</div>}
          </div>
          <div className="flex items-center gap-4">
            <StatTile label="Health" value={`${s.health}/${s.maxHealth}`} tone="danger" />
            <StatTile label="XP" value={s.xp} tone="warn" />
            <Link href={`/g/${s.gameId}`}><Button size="sm" variant="secondary">Resume</Button></Link>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function AchievementsTab() {
  const sessions = usePlayerStore((s) => s.sessions);
  const achievements = usePlayerStore((s) => s.achievements);
  const unlockAchievement = usePlayerStore((s) => s.unlockAchievement);

  const totalObjectives = useMemo(
    () => Object.values(sessions).reduce((sum, s) => sum + s.completedObjectiveIds.length, 0),
    [sessions],
  );

  useEffect(() => {
    for (const { threshold, achievement } of MILESTONES) {
      if (totalObjectives >= threshold) unlockAchievement(achievement);
    }
  }, [totalObjectives, unlockAchievement]);

  if (achievements.length === 0) {
    return <EmptyState icon={<Trophy className="h-6 w-6" />} title="No achievements yet" description="Complete mission objectives while playing to unlock your first badge." />;
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {achievements.map((a) => (
        <Panel key={a.id} className="flex items-start gap-3">
          <Award className="mt-0.5 h-5 w-5 text-accent" aria-hidden />
          <div>
            <div className="text-sm font-semibold text-text">{a.title}</div>
            <div className="text-xs text-muted">{a.description}</div>
            <div className="mt-1 font-hud text-[10px] text-muted">Unlocked {new Date(a.unlockedAt).toLocaleDateString()}</div>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function PurchasesTab({ authenticated }: { authenticated: boolean }) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const client = getGameWorldClient();
      const { data } = await withDemoFallback(async () => (await client.library.list({ limit: 50 })).items, getDemoLibrary);
      if (!cancelled) {
        setItems(data);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  if (loading) return <div className="font-hud text-xs text-muted animate-gw-pulse">Loading purchases…</div>;
  if (items.length === 0) return <EmptyState title="Nothing purchased yet" description="Items you buy in GameWorld Market will show up here." />;

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <Panel key={item.id} className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-text">{item.product.name}</div>
            <div className="font-hud text-[11px] text-muted">by {item.product.creator.displayName} · {item.product.category}</div>
          </div>
          <div className="flex items-center gap-2">
            {item.product.licenseSummary.commercial && <Badge tone="accent">Commercial</Badge>}
            {item.product.licenseSummary.multiplayer && <Badge tone="violet">Multiplayer</Badge>}
          </div>
        </Panel>
      ))}
    </div>
  );
}

export default function ProfilePage() {
  const user = usePlayerStore((s) => s.user);
  const token = usePlayerStore((s) => s.token);
  const clearSession = usePlayerStore((s) => s.clearSession);

  function signOut() {
    setStoredToken(undefined);
    clearSession();
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 font-hud text-xs uppercase tracking-[0.3em] text-accent">
          <User2 className="h-3.5 w-3.5" aria-hidden /> Player Passport
        </p>
        <h1 className="text-2xl font-semibold text-text">Your progress, saves & purchases</h1>
      </div>

      {user && token ? (
        <Panel className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 font-hud text-lg text-accent">
              {user.displayName.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="text-base font-semibold text-text">{user.displayName}</div>
              <div className="font-hud text-[11px] text-muted">@{user.handle} · {user.tier}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} rightIcon={<LogOut className="h-3.5 w-3.5" aria-hidden />}>Sign out</Button>
        </Panel>
      ) : (
        <SignInCard />
      )}

      <Tabs defaultValue="progress">
        <Tabs.List>
          <Tabs.Trigger value="progress">Progress & Saves</Tabs.Trigger>
          <Tabs.Trigger value="achievements">Achievements</Tabs.Trigger>
          <Tabs.Trigger value="purchases">Purchases</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="progress"><ProgressTab /></Tabs.Content>
        <Tabs.Content value="achievements"><AchievementsTab /></Tabs.Content>
        <Tabs.Content value="purchases"><PurchasesTab authenticated={Boolean(token)} /></Tabs.Content>
      </Tabs>
    </main>
  );
}
