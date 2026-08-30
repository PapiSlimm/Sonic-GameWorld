// Deterministic dialogue engine backing `POST /npcs/:id/chat`. No external AI call is required —
// replies are templated off the NPC's `personality.tone`/`goals`/`traits` and a handful of intent
// keywords, seeded by (npcId, turn index, message) so a given conversation replays identically.
import type { NPCDefinition } from '@sonic-gameworld/world-schema';

export interface DialogueTurn {
  role: 'user' | 'npc';
  text: string;
}

export interface DialogueReply {
  text: string;
  emotion?: string;
  actions?: Record<string, unknown>;
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)] as T;
}

const GREETING_WORDS = ['hi', 'hello', 'hey', 'greetings', 'yo'];
const FAREWELL_WORDS = ['bye', 'farewell', 'goodbye', 'later'];
const QUEST_WORDS = ['quest', 'mission', 'task', 'job', 'help me'];
const THANK_WORDS = ['thanks', 'thank you', 'appreciate'];

const TONE_TEMPLATES: Record<string, string[]> = {
  stern: ["Speak plainly. I don't have all day.", 'Mind yourself around here.', "I'm mostly focused on {goal} these days."],
  warm: ['Good to see a friendly face — what can I do for you?', 'Always happy to chat, truth be told.'],
  hostile: ['Watch your tone.', "You're testing my patience.", "Most folks call me {trait}, and not without reason."],
  thoughtful: ["Hm — that's worth turning over for a moment.", 'Every question opens two more, does it not?'],
  gentle: ["Take your time, there's no rush.", "I'm listening, truly."],
  jovial: ["Ha! Now that's a story worth hearing.", 'Pull up a seat, friend.'],
  blunt: ['Get to the point.', "I don't have patience for riddles."],
  urgent: ["Please — we don't have much time for this.", 'I need you to understand how serious this is.'],
  neutral: ['I see. Go on.', "Noted — I'm mostly focused on {goal} these days."],
};

function fillTemplate(template: string, npc: NPCDefinition, rand: () => number): string {
  const goal = npc.personality.goals.length ? pick(npc.personality.goals, rand) : 'my own business';
  const trait = npc.personality.traits.length ? pick(npc.personality.traits, rand) : 'careful';
  return template.replace('{goal}', goal).replace('{trait}', trait);
}

/** Produce the NPC's next line given the prior turns + a new user message. Never throws. */
export function generateNpcReply(npc: NPCDefinition, history: DialogueTurn[], message: string): DialogueReply {
  const lower = message.toLowerCase();
  const rand = mulberry32(hashSeed(`${npc.id}:${history.length}:${message}`));

  if (history.length === 0 && npc.dialogue.openingLines.length > 0 && GREETING_WORDS.some((w) => lower.includes(w))) {
    return { text: pick(npc.dialogue.openingLines, rand), emotion: npc.personality.tone };
  }
  if (FAREWELL_WORDS.some((w) => lower.includes(w))) {
    return { text: 'Safe travels.', emotion: npc.personality.tone };
  }
  if (THANK_WORDS.some((w) => lower.includes(w))) {
    return { text: "Of course — that's what I'm here for.", emotion: 'warm' };
  }
  if (QUEST_WORDS.some((w) => lower.includes(w)) && npc.questLogic?.missionIds.length) {
    return {
      text: `I might have something for you. It concerns ${npc.personality.goals[0] ?? 'a matter close to me'}.`,
      emotion: 'hopeful',
      actions: { suggestedMissionIds: npc.questLogic.missionIds },
    };
  }

  const templates = TONE_TEMPLATES[npc.personality.tone] ?? TONE_TEMPLATES.neutral ?? ['I see.'];
  return { text: fillTemplate(pick(templates, rand), npc, rand), emotion: npc.personality.tone };
}
