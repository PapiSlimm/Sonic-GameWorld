'use client';

import { useState } from 'react';
import type { NPC } from '@sonic-gameworld/gameworld-sdk';
import { Button } from '@sonic-gameworld/ui';
import { Loader2, Send } from 'lucide-react';
import { chatWithNpc } from '../../lib/npcs';

interface ChatMessage {
  id: string;
  from: 'you' | 'npc';
  text: string;
}

export interface ChatPanelProps {
  npc: NPC;
  offline: boolean;
}

export function ChatPanel({ npc, offline }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setMessages((m) => [...m, { id: `${Date.now()}-you`, from: 'you', text: trimmed }]);
    setText('');
    setBusy(true);
    try {
      const result = await chatWithNpc(npc, trimmed, offline);
      setMessages((m) => [...m, { id: `${Date.now()}-npc`, from: 'npc', text: result.reply }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col border-l border-border">
      <div className="border-b border-border px-3 py-2 font-hud text-[11px] uppercase tracking-[0.2em] text-muted">Chat test — {npc.name}</div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && <p className="text-xs text-muted">Say something to test {npc.name}&apos;s dialogue and personality.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`max-w-[85%] rounded-panel px-3 py-1.5 text-xs ${m.from === 'you' ? 'ml-auto bg-accent/10 text-accent' : 'bg-bg text-text/85'}`}>
            {m.text}
          </div>
        ))}
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />}
      </div>
      <form
        className="flex items-center gap-2 border-t border-border p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          className="h-8 flex-1 rounded-control border border-border bg-bg px-2.5 text-xs text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={busy} leftIcon={<Send className="h-3.5 w-3.5" />}>
          Send
        </Button>
      </form>
    </div>
  );
}
