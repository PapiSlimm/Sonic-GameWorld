import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMatch, RTS_FACTIONS, type RTSMatchState } from '@sonic-gameworld/rts-sim';
import { RtsHud } from './RtsHud';

function makeMatch(overrides: Partial<RTSMatchState> = {}): RTSMatchState {
  const factions = RTS_FACTIONS.map((f, i) => ({ factionId: f.id, isAIControlled: i !== 0 }));
  return { ...createMatch({ seed: 1, mapWidthM: 1000, mapDepthM: 1000, cellSizeM: 40, factions }), ...overrides };
}

describe('RtsHud', () => {
  it('shows the local faction name and current tick, with no possess button when nothing is selected', () => {
    const html = renderToStaticMarkup(
      <RtsHud
        match={makeMatch()}
        localFactionId={RTS_FACTIONS[0]!.id}
        selectedUnitIds={[]}
        possessedUnitId={null}
        desynced={false}
        onPossess={() => {}}
        onReleasePossession={() => {}}
      />,
    );
    expect(html).toContain(RTS_FACTIONS[0]!.name);
    expect(html).toContain('tick 0');
    expect(html).not.toContain('Possess unit');
  });

  it('shows a Possess button when exactly one unit is selected', () => {
    const html = renderToStaticMarkup(
      <RtsHud
        match={makeMatch()}
        localFactionId={RTS_FACTIONS[0]!.id}
        selectedUnitIds={['unit-1']}
        possessedUnitId={null}
        desynced={false}
        onPossess={() => {}}
        onReleasePossession={() => {}}
      />,
    );
    expect(html).toContain('Possess unit');
  });

  it('shows the return-to-overview control (with the Esc hint) instead, once a unit is possessed', () => {
    const html = renderToStaticMarkup(
      <RtsHud
        match={makeMatch()}
        localFactionId={RTS_FACTIONS[0]!.id}
        selectedUnitIds={['unit-1']}
        possessedUnitId="unit-1"
        desynced={false}
        onPossess={() => {}}
        onReleasePossession={() => {}}
      />,
    );
    expect(html).toContain('Return to overview');
    expect(html).toContain('Esc');
    expect(html).not.toContain('Possess unit');
  });

  it('shows a desync warning banner when desynced', () => {
    const html = renderToStaticMarkup(
      <RtsHud
        match={makeMatch()}
        localFactionId={RTS_FACTIONS[0]!.id}
        selectedUnitIds={[]}
        possessedUnitId={null}
        desynced
        onPossess={() => {}}
        onReleasePossession={() => {}}
      />,
    );
    expect(html).toContain('Desync detected');
  });

  it('shows a game-over banner naming the winner', () => {
    const html = renderToStaticMarkup(
      <RtsHud
        match={makeMatch({ status: 'GAME_OVER', winnerFactionId: RTS_FACTIONS[1]!.id })}
        localFactionId={RTS_FACTIONS[0]!.id}
        selectedUnitIds={[]}
        possessedUnitId={null}
        desynced={false}
        onPossess={() => {}}
        onReleasePossession={() => {}}
      />,
    );
    expect(html).toContain(`${RTS_FACTIONS[1]!.name} wins`);
    expect(html).not.toContain('Victory!');
  });

  it('shows a draw banner when there is no winner', () => {
    const html = renderToStaticMarkup(
      <RtsHud
        match={makeMatch({ status: 'GAME_OVER', winnerFactionId: null })}
        localFactionId={RTS_FACTIONS[0]!.id}
        selectedUnitIds={[]}
        possessedUnitId={null}
        desynced={false}
        onPossess={() => {}}
        onReleasePossession={() => {}}
      />,
    );
    expect(html).toContain('Draw');
  });
});
