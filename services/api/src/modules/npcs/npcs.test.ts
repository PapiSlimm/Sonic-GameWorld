import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, devLogin, type TestApp } from '../../test/helpers.js';
import { generateNpcDefinition } from './generator.js';
import { generateNpcReply } from './dialogue.js';

describe('npcs: generator', () => {
  it('is deterministic for a given prompt + name', async () => {
    const a = await generateNpcDefinition({ prompt: 'a grumpy blacksmith who secretly loves poetry' });
    const b = await generateNpcDefinition({ prompt: 'a grumpy blacksmith who secretly loves poetry' });
    expect(a.name).toBe(b.name);
    expect(a.personality.traits).toEqual(b.personality.traits);
    expect(a.personality.tone).toBe(b.personality.tone);
  });

  it('matches an archetype from the prompt text', async () => {
    const npc = await generateNpcDefinition({ prompt: 'a friendly merchant selling potions' });
    expect(npc.personality.tone).toBe('warm');
    expect(npc.behavior.faction).toBe('guild_of_merchants');
  });

  it('falls back to the deterministic base when the AI hook throws', async () => {
    const npc = await generateNpcDefinition(
      { prompt: 'a stern town guard' },
      { aiHook: async () => { throw new Error('provider unavailable'); } },
    );
    expect(npc.name).toBeTruthy();
    expect(npc.personality.tone).toBe('stern');
  });
});

describe('npcs: dialogue engine', () => {
  it('produces a non-empty, tone-appropriate reply', async () => {
    const npc = await generateNpcDefinition({ prompt: 'a hostile bandit', name: 'Test Bandit' });
    const reply = generateNpcReply(npc, [], 'What do you want from me?');
    expect(reply.text.length).toBeGreaterThan(0);
    expect(reply.emotion).toBe('hostile');
  });

  it('greets with an opening line on the first turn', async () => {
    const npc = await generateNpcDefinition({ prompt: 'an innkeeper', name: 'Test Innkeeper' });
    const reply = generateNpcReply(npc, [], 'hello there');
    expect(npc.dialogue.openingLines).toContain(reply.text);
  });
});

describe('npcs: CRUD + generate + chat routes', () => {
  let ctx: TestApp;
  afterEach(async () => {
    await ctx?.close();
  });

  it('generates an NPC, persists it, and supports multi-turn chat', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'npc-owner@example.com');
    const auth = { authorization: `Bearer ${session.accessToken}` };

    const world = (await ctx.app.inject({ method: 'POST', url: '/v1/worlds', headers: auth, payload: { name: 'NPC World' } })).json();

    const genRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/npcs/generate',
      headers: auth,
      payload: { worldId: world.id, prompt: 'a wise old scholar who guards ancient secrets' },
    });
    expect(genRes.statusCode).toBe(201);
    const npc = genRes.json();
    expect(npc.worldId).toBe(world.id);
    expect(npc.definition.personality.traits.length).toBeGreaterThan(0);

    const getRes = await ctx.app.inject({ method: 'GET', url: `/v1/npcs/${npc.id}`, headers: auth });
    expect(getRes.statusCode).toBe(200);

    const chat1 = await ctx.app.inject({ method: 'POST', url: `/v1/npcs/${npc.id}/chat`, headers: auth, payload: { message: 'hello!' } });
    expect(chat1.statusCode).toBe(201);
    const chat1Body = chat1.json();
    expect(chat1Body.conversationId).toBeTruthy();
    expect(chat1Body.reply.text.length).toBeGreaterThan(0);

    const chat2 = await ctx.app.inject({
      method: 'POST',
      url: `/v1/npcs/${npc.id}/chat`,
      headers: auth,
      payload: { message: 'do you have a quest for me?', conversationId: chat1Body.conversationId },
    });
    expect(chat2.statusCode).toBe(201);
    expect(chat2.json().conversationId).toBe(chat1Body.conversationId);
  });

  it('rejects chat from a user who cannot access a DRAFT NPC owned by someone else', async () => {
    ctx = await buildTestApp();
    const owner = await devLogin(ctx.app, 'npc-owner2@example.com');
    const stranger = await devLogin(ctx.app, 'npc-stranger@example.com');

    const npcRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/npcs',
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { name: 'Private NPC' },
    });
    expect(npcRes.statusCode).toBe(201);
    const npc = npcRes.json();
    expect(npc.status).toBe('DRAFT');

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/v1/npcs/${npc.id}/chat`,
      headers: { authorization: `Bearer ${stranger.accessToken}` },
      payload: { message: 'hi' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows chat with an ACTIVE NPC even for a non-owner', async () => {
    ctx = await buildTestApp();
    const owner = await devLogin(ctx.app, 'npc-owner3@example.com');
    const player = await devLogin(ctx.app, 'npc-player@example.com');

    const npc = (
      await ctx.app.inject({ method: 'POST', url: '/v1/npcs', headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { name: 'Public NPC' } })
    ).json();
    const activated = (
      await ctx.app.inject({
        method: 'PATCH',
        url: `/v1/npcs/${npc.id}`,
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { status: 'ACTIVE' },
      })
    ).json();
    expect(activated.status).toBe('ACTIVE');

    const chatRes = await ctx.app.inject({
      method: 'POST',
      url: `/v1/npcs/${npc.id}/chat`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { message: 'hello' },
    });
    expect(chatRes.statusCode).toBe(201);
  });
});
