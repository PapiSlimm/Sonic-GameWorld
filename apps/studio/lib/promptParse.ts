import { GENRES, type Genre } from '@sonic-gameworld/world-schema';

const GENRE_KEYWORDS: Partial<Record<Genre, string[]>> = {
  CYBERPUNK: ['cyberpunk', 'neon', 'cyber'],
  FANTASY: ['fantasy', 'medieval', 'dragon', 'kingdom'],
  SCIFI: ['sci-fi', 'scifi', 'space', 'starship', 'alien'],
  HORROR: ['horror', 'haunted', 'zombie'],
  STRATEGY: ['strategy', 'base building'],
  SHOOTER: ['shooter', 'fps', 'combat'],
  RACING: ['racing', 'race track', 'circuit'],
  RPG: ['rpg', 'role-playing', 'quest'],
  MMO: ['mmo', 'massively multiplayer'],
  SURVIVAL: ['survival', 'wasteland'],
  TACTICAL: ['tactical', 'stealth'],
  OPEN_WORLD: ['open world', 'open-world', 'city', 'sandbox'],
};

/** Best-effort extraction of world-creation fields from a free-text AI prompt. */
export function parseWorldPrompt(prompt: string): { name: string; description: string; genre: Genre[]; sizeKm2: number } {
  const lower = prompt.toLowerCase();

  const sizeMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:km2|km²|km|kilometer)/);
  const sizeKm2 = sizeMatch ? Math.min(200, Math.max(1, Number(sizeMatch[1]))) : 4;

  const genre = GENRES.filter((g) => GENRE_KEYWORDS[g]?.some((kw) => lower.includes(kw)));

  const words = prompt
    .replace(/^build me\s+/i, '')
    .replace(/^create\s+/i, '')
    .replace(/^generate\s+/i, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  const name = words.length ? words.map((w, i) => (i === 0 ? w[0]!.toUpperCase() + w.slice(1) : w)).join(' ') : 'Untitled World';

  return { name, description: prompt.trim(), genre: genre.length ? genre : ['CYBERPUNK'], sizeKm2 };
}
