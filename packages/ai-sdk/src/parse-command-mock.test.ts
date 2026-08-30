import { describe, expect, it } from 'vitest';
import { parseCommandMock, validateToolCall } from './index.js';

function expectValid(calls: ReturnType<typeof parseCommandMock>) {
  for (const call of calls) {
    const result = validateToolCall(call);
    expect(result.ok, `expected ${call.tool} args to validate: ${!result.ok ? result.issues.join('; ') : ''}`).toBe(true);
  }
}

describe('parseCommandMock', () => {
  it('parses "spawn N enemies near <entity>" into a spawn_npc call', () => {
    const calls = parseCommandMock('spawn 3 enemies near building 7');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      tool: 'spawn_npc',
      args: { archetype: 'enemy', count: 3, placement: { relation: 'NEAR', anchor: 'building 7' } },
    });
    expectValid(calls);
  });

  it('parses "spawn N guards behind <entity>"', () => {
    const calls = parseCommandMock('spawn 5 guards behind the precinct');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.tool).toBe('spawn_npc');
    expect(calls[0]?.args).toMatchObject({ archetype: 'guard', count: 5, placement: { relation: 'BEHIND', anchor: 'precinct' } });
    expectValid(calls);
  });

  it('parses "spawn N zombies near <entity>"', () => {
    const calls = parseCommandMock('spawn 10 zombies near the market');
    expect(calls[0]?.args).toMatchObject({ archetype: 'zombie', count: 10 });
    expectValid(calls);
  });

  it('parses "follow player N" into track_entity', () => {
    const calls = parseCommandMock('follow player 17');
    expect(calls).toEqual([{ tool: 'track_entity', args: { entity: 'Player 17', cameraMode: 'FOLLOW' } }]);
    expectValid(calls);
  });

  it('parses "track <name>" into track_entity', () => {
    const calls = parseCommandMock('track building 7');
    expect(calls).toEqual([{ tool: 'track_entity', args: { entity: 'Building 7', cameraMode: 'FOLLOW' } }]);
    expectValid(calls);
  });

  it.each([
    ['start the storm', 'STORM'],
    ['start the rain', 'RAIN'],
    ['start the snow', 'SNOW'],
    ['start the fog', 'FOG'],
  ])('parses "%s" into set_weather(%s)', (text, weather) => {
    const calls = parseCommandMock(text);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.tool).toBe('set_weather');
    expect(calls[0]?.args.weather).toBe(weather);
    expectValid(calls);
  });

  it.each([
    ['set time to 14', 14],
    ['set time to night', 22],
    ['set time to dawn', 6],
    ['set time to noon', 12],
  ])('parses "%s" into set_time_of_day(%s)', (text, hour) => {
    const calls = parseCommandMock(text);
    expect(calls).toEqual([{ tool: 'set_time_of_day', args: { hour } }]);
    expectValid(calls);
  });

  it('parses "create a cinematic shot of <x>" into create_cinematic', () => {
    const calls = parseCommandMock('create a cinematic shot of the skyline towers');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.tool).toBe('create_cinematic');
    expect(calls[0]?.args.subject).toBe('the skyline towers');
    expectValid(calls);
  });

  it('parses "make this area a boss arena" into create_trigger + modify_entity', () => {
    const calls = parseCommandMock('make this area a boss arena', { anchorName: 'Building 7 Rooftop' });
    expect(calls.map((c) => c.tool)).toEqual(['create_trigger', 'modify_entity']);
    expect(calls[0]?.args).toMatchObject({ kind: 'ENTER_VOLUME', entity: 'Building 7 Rooftop' });
    expect(calls[1]?.args).toMatchObject({ entityName: 'Building 7 Rooftop' });
    expectValid(calls);
  });

  it('parses "create a zombie outbreak in <place>" into a multi-tool plan', () => {
    const calls = parseCommandMock('create a zombie outbreak in the old town');
    const tools = calls.map((c) => c.tool);
    expect(tools.filter((t) => t === 'spawn_npc')).toHaveLength(2);
    expect(tools).toContain('set_weather');
    expect(tools).toContain('create_trigger');
    for (const call of calls) {
      if (call.tool === 'spawn_npc') expect(call.args.archetype).toBe('zombie');
    }
    expectValid(calls);
  });

  it('parses "add civilians, police, gangs and autonomous vehicles" into multiple spawn_npc calls', () => {
    const calls = parseCommandMock('add civilians, police, gangs and autonomous vehicles');
    expect(calls).toHaveLength(4);
    expect(calls.every((c) => c.tool === 'spawn_npc')).toBe(true);
    expect(calls.map((c) => c.args.archetype)).toEqual(['civilian', 'police', 'gang_member', 'autonomous_vehicle']);
    expectValid(calls);
  });

  it('parses "make it an extraction game" into create_quest-like mission tool calls', () => {
    const calls = parseCommandMock('make it an extraction game');
    expect(calls[0]?.tool).toBe('create_quest');
    expect(calls.some((c) => c.tool === 'create_trigger')).toBe(true);
    expectValid(calls);
  });

  it('parses "publish it" into publish_asset', () => {
    const calls = parseCommandMock('publish it');
    expect(calls).toEqual([{ tool: 'publish_asset', args: { target: 'WORLD', visibility: 'PUBLIC' } }]);
    expectValid(calls);
  });

  it('returns an empty plan for unrecognized input (deterministic no-op)', () => {
    expect(parseCommandMock('do a backflip please')).toEqual([]);
  });

  it('is deterministic across repeated calls', () => {
    const a = parseCommandMock('spawn 4 enemies near the gate');
    const b = parseCommandMock('spawn 4 enemies near the gate');
    expect(a).toEqual(b);
  });
});
