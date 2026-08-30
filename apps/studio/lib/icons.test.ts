import { describe, expect, it } from 'vitest';
import { ENTITY_KINDS } from '@sonic-gameworld/world-schema';
import { ENTITY_KIND_ICONS, entityKindIcon } from './icons';

describe('entityKindIcon', () => {
  it('has an explicit icon for every EntityKind, including the RTS additions (docs/RTS-CONTRACTS.md §6)', () => {
    for (const kind of ENTITY_KINDS) {
      expect(ENTITY_KIND_ICONS[kind]).toBeDefined();
    }
  });

  it('gives RTS_UNIT and RTS_BUILDING distinct icons from each other and from PROP', () => {
    expect(entityKindIcon('RTS_UNIT')).toBe(ENTITY_KIND_ICONS.RTS_UNIT);
    expect(entityKindIcon('RTS_BUILDING')).toBe(ENTITY_KIND_ICONS.RTS_BUILDING);
    expect(ENTITY_KIND_ICONS.RTS_UNIT).not.toBe(ENTITY_KIND_ICONS.RTS_BUILDING);
    expect(ENTITY_KIND_ICONS.RTS_UNIT).not.toBe(ENTITY_KIND_ICONS.PROP);
  });
});
