"use client";

import { useState } from "react";
import type { ChatMessageDTO } from "@/server/chat";

export interface AgentChatState {
  messages: ChatMessageDTO[];
  input: string;
  setInput: (v: string) => void;
  sending: boolean;
  streaming: string;
  send: () => Promise<void>;
}

/** Message history + SSE send logic for chatting with one agent. */
export function useAgentChat(
  agentId: string,
  initialMessages: ChatMessageDTO[],
): AgentChatState {
  const [messages, setMessages] = useState<ChatMessageDTO[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState("");

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
          {
            id: `local-${Date.now()}-a`,
            role: "assistant",
            content: acc,
            at: new Date().toISOString(),
          },
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

  return { messages, input, setInput, sending, streaming, send };
}
