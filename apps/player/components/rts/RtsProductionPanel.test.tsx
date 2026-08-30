import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMatch, RTS_FACTIONS, type RTSMatchState } from '@sonic-gameworld/rts-sim';
import { seedStartingScenario } from '../../lib/rts/scenario';
import { RtsProductionPanel } from './RtsProductionPanel';

function makeMatch(): RTSMatchState {
  const factions = RTS_FACTIONS.map((f, i) => ({ factionId: f.id, isAIControlled: i !== 0 }));
  return seedStartingScenario(createMatch({ seed: 3, mapWidthM: 1000, mapDepthM: 1000, cellSizeM: 40, factions }));
}

describe('RtsProductionPanel', () => {
  it('shows the credits total and a Build button per owned production building', () => {
    const match = makeMatch();
    const localFactionId = RTS_FACTIONS[0]!.id;
    const credits = Math.floor(match.economy[localFactionId]!.credits);

    const html = renderToStaticMarkup(<RtsProductionPanel match={match} localFactionId={localFactionId} onEnqueue={() => {}} />);

    expect(html).toContain(String(credits));
    expect(html).toContain('BARRACKS');
    expect(html).toContain('FACTORY');
    expect(html).toContain('Build infantry');
    expect(html).toContain('Build armored');
  });

  it('shows the empty state once the local faction owns no buildings', () => {
    const match = makeMatch();
    const localFactionId = RTS_FACTIONS[0]!.id;
    match.entities.buildings = match.entities.buildings.filter((b) => b.factionId !== localFactionId);

    const html = renderToStaticMarkup(<RtsProductionPanel match={match} localFactionId={localFactionId} onEnqueue={() => {}} />);
    expect(html).toContain('No production buildings remain.');
  });

  it('renders a progress bar for a queued production item targeting an owned building', () => {
    const match = makeMatch();
    const localFactionId = RTS_FACTIONS[0]!.id;
    const barracks = match.entities.buildings.find((b) => b.factionId === localFactionId && b.buildingClass === 'BARRACKS')!;
    match.productionQueue.push({ id: 'queued-1', factionId: localFactionId, unitClass: 'INFANTRY', buildingId: barracks.id, startedAtTick: match.tick, durationTicks: 35 });

    const html = renderToStaticMarkup(<RtsProductionPanel match={match} localFactionId={localFactionId} onEnqueue={() => {}} />);
    expect(html).toContain('INFANTRY');
  });
});
