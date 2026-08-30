'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ExternalLink, Star } from 'lucide-react';
import { Badge, Button, Input, Panel, PriceTag, ScoreRing, useToast } from '@sonic-gameworld/ui';
import { useApi, useResource } from '../../lib/api';
import { demoPassport, demoProductSummaries } from '../../lib/demo';

export default function StorefrontPage() {
  const { client, status, identity } = useApi();
  const { push } = useToast();

  const passportRes = useResource('creator:passport', (c) => c.creators.get(identity?.handle ?? 'novaforge'), demoPassport);
  const productsRes = useResource(
    'storefront:products',
    async (c) => (await c.marketplace.search({ creatorId: identity?.userId, limit: 50 })).items,
    demoProductSummaries,
  );

  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [featuredIds, setFeaturedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setHandle(passportRes.data.profile.handle);
    setBio(passportRes.data.profile.bio ?? '');
    setBannerUrl(passportRes.data.profile.bannerUrl ?? '');
    setFeaturedIds(new Set(passportRes.data.featuredProducts.map((p) => p.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passportRes.data]);

  const save = async () => {
    setSaving(true);
    try {
      if (status === 'live' && identity) {
        if (handle !== passportRes.data.profile.handle) {
          await client.users.update(identity.userId, { handle });
        }
        await client.creators.updateMe({ bio, bannerUrl: bannerUrl || undefined });
        passportRes.reload();
      } else {
        await new Promise((r) => setTimeout(r, 400));
      }
      push({ title: 'Storefront saved', tone: 'success' });
    } catch (err) {
      push({ title: 'Failed to save storefront', description: err instanceof Error ? err.message : undefined, tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const toggleFeatured = async (productId: string) => {
    const next = new Set(featuredIds);
    const willFeature = !next.has(productId);
    if (willFeature) next.add(productId);
    else next.delete(productId);
    setFeaturedIds(next);
    try {
      if (status === 'live') {
        await client.products.update(productId, { featured: willFeature });
      }
    } catch (err) {
      push({ title: 'Could not update featured products', description: err instanceof Error ? err.message : undefined, tone: 'danger' });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Storefront</h1>
          <p className="text-sm text-muted">How buyers see you on GameWorld Market.</p>
        </div>
        <Link
          href={`/c/${handle || passportRes.data.profile.handle}`}
          target="_blank"
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
          title="Opens the marketplace storefront (apps/marketplace, port 3001)"
        >
          Preview storefront <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {(passportRes.mode === 'demo' || productsRes.mode === 'demo') && (
        <div className="flex items-center gap-2 rounded-control border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          <AlertTriangle className="h-3.5 w-3.5" /> Showing offline demo data — the live API at {client.baseUrl} was not reachable.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Profile" className="lg:col-span-2">
          <div className="flex flex-col gap-4">
            <Input label="Handle" value={handle} onChange={(e) => setHandle(e.target.value)} hint="Your storefront URL: /c/<handle>" />
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-hud text-[11px] uppercase tracking-wider text-muted">Bio</span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="w-full rounded-control border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </label>
            <Input label="Banner image URL" placeholder="https://…" value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} />
            <div className="flex justify-end">
              <Button onClick={() => void save()} loading={saving}>
                Save storefront
              </Button>
            </div>
          </div>
        </Panel>
        <Panel title="Reputation">
          <div className="flex flex-col items-center gap-3">
            <ScoreRing value={passportRes.data.reputation.score} label="Creator Score" size={120} />
            <div className="flex flex-wrap justify-center gap-1.5">
              {passportRes.data.badges.map((b) => (
                <Badge key={b} tone="violet">{b.replace(/_/g, ' ')}</Badge>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Featured products">
        <p className="mb-3 text-sm text-muted">Choose up to a handful of products to highlight at the top of your storefront.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {productsRes.data.map((p) => {
            const featured = featuredIds.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => void toggleFeatured(p.id)}
                className={`flex flex-col gap-2 rounded-panel border p-3 text-left transition-colors ${featured ? 'border-accent bg-accent/10 shadow-glow' : 'border-border hover:border-accent/40'}`}
              >
                <div className="flex items-start justify-between">
                  <span className="text-sm font-medium text-text">{p.name}</span>
                  <Star className={`h-4 w-4 shrink-0 ${featured ? 'fill-accent text-accent' : 'text-muted'}`} />
                </div>
                <PriceTag cents={p.priceCents} size="sm" />
              </button>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
