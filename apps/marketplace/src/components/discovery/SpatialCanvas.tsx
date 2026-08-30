'use client';

import { useMemo, useState } from 'react';
import { Radar } from 'lucide-react';
import type { GlobeCluster } from '../../lib/spatialTree.js';
import type { DiscoveryCluster } from '../../lib/types.js';

export interface SpatialCanvasProps {
  clusters: GlobeCluster[];
  selectedCluster: DiscoveryCluster | null;
  selectedGenreKey: string | null;
  selectedProductId: string | null;
  onSelectCluster: (cluster: DiscoveryCluster | null) => void;
  onSelectGenre: (genreKey: string | null) => void;
  onSelectProduct: (productId: string) => void;
}

interface Point {
  x: number;
  y: number;
}

const WIDTH = 820;
const HEIGHT = 560;
const CENTER: Point = { x: WIDTH / 2, y: HEIGHT / 2 };
const CLUSTER_RADIUS = 175;
const GENRE_RADIUS = 96;
const ITEM_RADIUS = 58;

const CLUSTER_COLOR: Record<DiscoveryCluster, string> = {
  WORLDS: '#38F5C8',
  GAMES: '#7C5CFF',
  ASSETS: '#FFB020',
};

function polar(origin: Point, radius: number, angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: origin.x + radius * Math.cos(rad), y: origin.y + radius * Math.sin(rad) };
}

function outwardAngle(origin: Point): number {
  return (Math.atan2(origin.y - CENTER.y, origin.x - CENTER.x) * 180) / Math.PI;
}

/** Spreads `count` children across an arc centered on `centerAngle`. */
function spreadAngles(count: number, centerAngle: number): number[] {
  if (count <= 1) return [centerAngle];
  const spread = Math.min(300, 36 + count * 20);
  const step = spread / (count - 1);
  return Array.from({ length: count }, (_, i) => centerAngle - spread / 2 + i * step);
}

/**
 * 2D radial "constellation" graph: three orbits (cluster → genre → item)
 * expanding outward from a shared center. This is the SVG fallback
 * `DiscoveryGlobeStage` renders whenever WebGL is unavailable or
 * `@sonic-gameworld/spatial-engine/react`'s `DiscoveryGlobe` isn't built yet
 * (see the app README's "Spatial discovery: DiscoveryGlobe availability").
 */
export function SpatialCanvas({
  clusters,
  selectedCluster,
  selectedGenreKey,
  selectedProductId,
  onSelectCluster,
  onSelectGenre,
  onSelectProduct,
}: SpatialCanvasProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const clusterPositions = useMemo(() => {
    const angles = spreadAngles(clusters.length, -90);
    return clusters.map((cluster, i) => ({ cluster, pos: polar(CENTER, CLUSTER_RADIUS, angles[i]!) }));
  }, [clusters]);

  return (
    <div className="relative overflow-hidden rounded-panel border border-border bg-[radial-gradient(circle_at_50%_40%,rgba(56,245,200,0.07),transparent_60%)] bg-bg">
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-border bg-panel/80 px-2.5 py-1 font-hud text-[9px] uppercase tracking-[0.15em] text-muted backdrop-blur">
        <Radar className="h-3 w-3 text-accent animate-gw-pulse" />
        Spatial fallback · 2D radial graph
      </div>
      <button
        type="button"
        onClick={() => {
          onSelectCluster(null);
          onSelectGenre(null);
        }}
        className="absolute right-3 top-3 z-10 rounded-full border border-border bg-panel/80 px-3 py-1 font-hud text-[10px] uppercase tracking-wider text-muted hover:text-accent"
      >
        Recenter
      </button>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[420px] w-full sm:h-[480px]" role="img" aria-label="Spatial discovery map">
        {/* center hub */}
        <g>
          <circle cx={CENTER.x} cy={CENTER.y} r={30} className="fill-panel stroke-accent/50" strokeWidth={1.5} />
          <text x={CENTER.x} y={CENTER.y + 4} textAnchor="middle" className="fill-text font-hud text-[10px] uppercase tracking-wider">
            Market
          </text>
        </g>

        {clusterPositions.map(({ cluster, pos }) => {
          const isFocused = selectedCluster === cluster.key;
          const isHovered = hovered === `cluster:${cluster.key}`;
          const color = CLUSTER_COLOR[cluster.key];
          const showGenres = isFocused;

          return (
            <g key={cluster.key}>
              <line x1={CENTER.x} y1={CENTER.y} x2={pos.x} y2={pos.y} stroke={color} strokeOpacity={isFocused ? 0.6 : 0.25} strokeWidth={1.5} />
              <g
                onClick={() => {
                  onSelectCluster(isFocused ? null : cluster.key);
                  onSelectGenre(null);
                }}
                onMouseEnter={() => setHovered(`cluster:${cluster.key}`)}
                onMouseLeave={() => setHovered(null)}
                className="cursor-pointer"
              >
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isFocused || isHovered ? 38 : 32}
                  fill={color}
                  fillOpacity={isFocused ? 0.22 : 0.12}
                  stroke={color}
                  strokeWidth={isFocused ? 2 : 1.25}
                  style={{ transition: 'all 180ms ease', filter: isFocused ? `drop-shadow(0 0 10px ${color}99)` : undefined }}
                />
                <text x={pos.x} y={pos.y + 4} textAnchor="middle" className="fill-text font-hud text-[11px] font-semibold uppercase tracking-wider">
                  {cluster.label}
                </text>
                <text x={pos.x} y={pos.y + 52} textAnchor="middle" className="fill-muted font-hud text-[9px] uppercase tracking-wider">
                  {cluster.itemCount} items
                </text>
              </g>

              {showGenres &&
                (() => {
                  const centerAngle = outwardAngle(pos);
                  const angles = spreadAngles(cluster.genres.length, centerAngle);
                  return cluster.genres.map((genre, gi) => {
                    const gPos = polar(pos, GENRE_RADIUS, angles[gi]!);
                    const genreFocused = selectedGenreKey === genre.key;
                    return (
                      <g key={genre.key}>
                        <line x1={pos.x} y1={pos.y} x2={gPos.x} y2={gPos.y} stroke={color} strokeOpacity={genreFocused ? 0.55 : 0.22} strokeWidth={1} />
                        <g
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectGenre(genreFocused ? null : genre.key);
                          }}
                          onMouseEnter={() => setHovered(`genre:${genre.key}`)}
                          onMouseLeave={() => setHovered(null)}
                          className="cursor-pointer"
                        >
                          <circle
                            cx={gPos.x}
                            cy={gPos.y}
                            r={genreFocused || hovered === `genre:${genre.key}` ? 22 : 18}
                            fill={color}
                            fillOpacity={genreFocused ? 0.3 : 0.14}
                            stroke={color}
                            strokeWidth={genreFocused ? 1.75 : 1}
                            style={{ transition: 'all 180ms ease' }}
                          />
                          <text x={gPos.x} y={gPos.y + 33} textAnchor="middle" className="fill-text/90 font-hud text-[9px] uppercase tracking-wide">
                            {genre.label}
                          </text>
                        </g>

                        {genreFocused &&
                          (() => {
                            const itemCenterAngle = outwardAngle(gPos);
                            const itemAngles = spreadAngles(genre.items.length, itemCenterAngle);
                            return genre.items.map((item, ii) => {
                              const iPos = polar(gPos, ITEM_RADIUS, itemAngles[ii]!);
                              const selected = selectedProductId === item.productId;
                              return (
                                <g key={item.productId}>
                                  <line x1={gPos.x} y1={gPos.y} x2={iPos.x} y2={iPos.y} stroke={color} strokeOpacity={0.35} strokeWidth={0.75} />
                                  <g onClick={(e) => { e.stopPropagation(); onSelectProduct(item.productId); }} className="cursor-pointer">
                                    <circle
                                      cx={iPos.x}
                                      cy={iPos.y}
                                      r={selected ? 11 : 7}
                                      className={selected ? 'fill-accent stroke-text' : 'fill-bg'}
                                      stroke={selected ? undefined : color}
                                      strokeWidth={selected ? 1.5 : 1}
                                      style={{ transition: 'all 150ms ease', filter: selected ? 'drop-shadow(0 0 8px #38F5C8cc)' : undefined }}
                                    />
                                  </g>
                                </g>
                              );
                            });
                          })()}
                      </g>
                    );
                  });
                })()}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
