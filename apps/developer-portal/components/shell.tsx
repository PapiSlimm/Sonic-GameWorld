'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, FlaskConical, KeyRound, LayoutDashboard, LogOut, Webhook as WebhookIcon, Blocks } from 'lucide-react';
import { Badge, Button, Input, useToast } from '@sonic-gameworld/ui';
import { getClient, API_BASE_URL } from '../lib/client';
import { clearSession, loadSession, saveSession, type StoredSession } from '../lib/session';

const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/keys', label: 'API Keys', icon: KeyRound },
  { href: '/webhooks', label: 'Webhooks', icon: WebhookIcon },
  { href: '/docs', label: 'Docs', icon: BookOpen },
  { href: '/sdks', label: 'SDKs', icon: Blocks },
  { href: '/sandbox', label: 'Sandbox', icon: FlaskConical },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 flex-col border-r border-border bg-panel/60 px-3 py-4 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2">
          <span className="h-2 w-2 rounded-full bg-accent shadow-glow" aria-hidden />
          <span className="font-hud text-xs uppercase tracking-[0.25em] text-muted">GameWorld</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={
                  'flex items-center gap-2.5 rounded-control px-3 py-2 text-sm transition-colors ' +
                  (active ? 'bg-bg text-accent shadow-glow' : 'text-text/70 hover:bg-bg hover:text-text')
                }
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="px-2 pt-4 text-[10px] text-muted">Developer Portal · Sonic GameWorld OS</div>
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <TopBar />
        <main className="flex-1 bg-[radial-gradient(circle_at_top,rgba(56,245,200,0.05),transparent_60%)] p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

function TopBar() {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [email, setEmail] = useState('dev@sonicgameworld.dev');
  const [pending, setPending] = useState(false);
  const toast = useToast();

  useEffect(() => setSession(loadSession()), []);

  const signIn = async () => {
    setPending(true);
    try {
      const res = await getClient().auth.dev({ email, displayName: 'Developer Portal' });
      saveSession({ token: res.tokens.accessToken, email: res.user.email, obtainedAt: new Date().toISOString() });
      setSession(loadSession());
      toast.push({ title: 'Signed in', description: `Connected to ${API_BASE_URL} as ${res.user.email}`, tone: 'success' });
    } catch (err) {
      toast.push({
        title: 'Sign-in unavailable',
        description: err instanceof Error ? err.message : 'The API is unreachable — pages will keep showing demo data.',
        tone: 'warn',
      });
    } finally {
      setPending(false);
    }
  };

  const signOut = () => {
    clearSession();
    setSession(null);
    toast.push({ title: 'Signed out', tone: 'info' });
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-panel/40 px-4 py-3 md:px-6">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold text-text">GameWorld Developer Portal</h1>
        <Badge tone="default" className="hidden sm:inline-flex">{API_BASE_URL}</Badge>
      </div>
      <div className="flex items-center gap-2">
        {session ? (
          <>
            <Badge tone="accent" dot>{session.email}</Badge>
            <Button variant="ghost" size="sm" leftIcon={<LogOut className="h-3.5 w-3.5" />} onClick={signOut}>
              Sign out
            </Button>
          </>
        ) : (
          <>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} className="h-8 w-56 text-xs" placeholder="dev@sonicgameworld.dev" />
            <Button size="sm" loading={pending} onClick={signIn}>
              Dev sign in
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
