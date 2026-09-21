"use client";

import { useEffect, useRef, useState } from "react";
import { Emblem } from "@/components/avatar/Emblem";
import type { AgentDTO } from "@/lib/types";
import type { ChatMessageDTO } from "@/server/chat";

interface Props {
  agents: AgentDTO[];
  initialAgentId: string;
  initialMessages: ChatMessageDTO[];
}

export function ChatClient({ agents, initialAgentId, initialMessages }: Props) {
  const [agentId, setAgentId] = useState(initialAgentId);
  const [messages, setMessages] = useState<ChatMessageDTO[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const agent = agents.find((a) => a.id === agentId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming]);

  async function switchAgent(id: string) {
    if (id === agentId || sending) return;
    setAgentId(id);
    setMessages([]);
    setStreaming("");
    try {
      const res = await fetch(`/api/chat/${id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      }
    } catch {
      /* history stays empty on failure */
    }
  }

  async function send() {
    const content = input.trim();
    if (!content || sending) return;
    setInput("");
    setSending(true);

    const userMsg: ChatMessageDTO = {
      id: `local-${Date.now()}`,
      role: "user",
      content,
      at: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setStreaming("");

    try {
      const res = await fetch(`/api/chat/${agentId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Couldn't reach your teammate.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const lines = part.split("\n");
          let event = "";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data = line.slice(5).trim();
          }
          if (!data) continue;
          try {
            const payload = JSON.parse(data);
            if (event === "delta" && typeof payload.text === "string") {
              acc += payload.text;
              setStreaming(acc);
            } else if (event === "done" && payload.message) {
              setMessages((m) => [...m, payload.message]);
              acc = "";
              setStreaming("");
            } else if (event === "error") {
              throw new Error(payload.error ?? "Reply failed.");
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
      // Fallback: if the stream ended without a done event, keep what streamed.
      if (acc) {
        setMessages((m) => [
          ...m,
          { id: `local-${Date.now()}-a`, role: "assistant", content: acc, at: new Date().toISOString() },
        ]);
        setStreaming("");
      }
    } catch (err) {
      setStreaming("");
      setMessages((m) => [
        ...m,
        {
          id: `local-${Date.now()}-e`,
          role: "assistant",
          content: `Couldn't get a reply: ${err instanceof Error ? err.message : "unknown error"}`,
          at: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-wrap">
      <div className="chat-agents" role="tablist" aria-label="Teammates">
        {agents.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={a.id === agentId}
            className={`chat-agent${a.id === agentId ? " active" : ""}`}
            onClick={() => switchAgent(a.id)}
          >
            <span className="chat-agent-emblem">
              <Emblem hue={a.hue} face={a.face} uid={`chat-${a.id}`} photoUrl={a.avatarUrl} />
            </span>
            <span className="chat-agent-name">{a.name}</span>
          </button>
        ))}
      </div>

      <div className="chat-main">
        <div className="chat-head">
          <span className="chat-head-dot" style={{ background: `hsl(${agent?.hue ?? 210} 70% 55%)` }} />
          <div>
            <div className="chat-head-name">{agent?.name}</div>
            <div className="chat-head-role">{agent?.role}</div>
          </div>
        </div>

        <div className="chat-messages">
          {messages.length === 0 && !streaming && (
            <div className="chat-empty">
              Say hello to {agent?.name} — ask a question, talk through a deal, or think out loud.
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`chat-msg ${m.role}`}>
              <div className="chat-bubble">{m.content}</div>
            </div>
          ))}
          {streaming && (
            <div className="chat-msg assistant">
              <div className="chat-bubble streaming">{streaming}<span className="caret" /></div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="chat-input-row">
          <input
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`Message ${agent?.name ?? "teammate"}…`}
            maxLength={8000}
            disabled={sending}
            aria-label="Chat message"
          />
          <button className="btn primary chat-send" onClick={send} disabled={sending || !input.trim()}>
            {sending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
