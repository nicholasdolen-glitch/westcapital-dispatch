"use client";

import { useEffect, useRef } from "react";
import { useAgentChat } from "./useAgentChat";
import type { ChatMessageDTO } from "@/server/chat";

interface Props {
  agentId: string;
  agentName: string;
  initialMessages: ChatMessageDTO[];
}

/** Simple chat bar for an agent's detail page — talk to them directly. */
export function AgentChat({ agentId, agentName, initialMessages }: Props) {
  const { messages, input, setInput, sending, streaming, send } =
    useAgentChat(agentId, initialMessages);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  return (
    <div className="panel agent-chat-panel">
      <h3>Chat with {agentName}</h3>
      <div className="agent-chat-messages" ref={listRef}>
        {messages.length === 0 && !streaming && (
          <div className="chat-empty">
            Say hello to {agentName} — ask a question, talk through a deal, or
            think out loud.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg ${m.role}`}>
            <div className="chat-bubble">{m.content}</div>
          </div>
        ))}
        {streaming && (
          <div className="chat-msg assistant">
            <div className="chat-bubble streaming">
              {streaming}
              <span className="caret" />
            </div>
          </div>
        )}
      </div>
      <div className="agent-chat-input-row">
        <input
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={`Message ${agentName}…`}
          maxLength={8000}
          disabled={sending}
          aria-label={`Message ${agentName}`}
        />
        <button
          className="btn primary chat-send"
          onClick={() => void send()}
          disabled={sending || !input.trim()}
        >
          {sending ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
