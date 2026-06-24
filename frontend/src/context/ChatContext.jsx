import React, { createContext, useContext, useRef, useState } from "react";
import { apiUrl } from "../lib/api.js";

const ChatContext = createContext(null);
const API_KEY_STORAGE_KEY = "apex_f1_anthropic_key";

export function useChat() {
  return useContext(ChatContext);
}

const TOOL_LABELS = {
  search_driver: "Searching drivers…",
  get_driver_stats: "Loading driver stats…",
  get_driver_wins: "Loading wins…",
  get_all_driver_win_counts: "Loading win rankings…",
  get_all_driver_pole_counts: "Loading pole rankings…",
  search_circuit: "Searching circuits…",
  get_season_events: "Loading season events…",
  get_race_results: "Loading race results…",
  get_standings_by_season: "Loading standings…",
  search_constructor: "Searching constructors…",
  search_team: "Searching teams…",
  get_overview_stats: "Loading stats…",
  get_season_champions: "Loading champions…",
  get_constructor_stats: "Loading constructor stats…",
  list_seasons: "Loading seasons…",
};

function loadApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function ChatProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey, setApiKeyState] = useState(loadApiKey);
  const abortRef = useRef(null);

  const setApiKey = (key) => {
    setApiKeyState(key);
    try {
      if (key) {
        localStorage.setItem(API_KEY_STORAGE_KEY, key);
      } else {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
      }
    } catch {
      // localStorage unavailable
    }
  };

  const sendMessage = async (text) => {
    if (!text.trim() || isLoading) return;

    const userMsg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsLoading(true);

    // Add placeholder assistant message
    const assistantMsg = { role: "assistant", content: "", toolStatus: null };
    setMessages([...newMessages, assistantMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const headers = { "Content-Type": "application/json" };
      const currentKey = loadApiKey();
      if (currentKey) {
        headers["X-Anthropic-Api-Key"] = currentKey;
      }

      const response = await fetch(apiUrl("/v1/chat"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: errText || `Error: ${response.status}`,
          };
          return updated;
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let data;
          try {
            data = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          if (data.type === "error") {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: data.content,
                isError: true,
                toolStatus: null,
              };
              return updated;
            });
          } else if (data.type === "text") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = {
                ...last,
                content: last.content + data.content,
                toolStatus: null,
              };
              return updated;
            });
          } else if (data.type === "tool_status") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = {
                ...last,
                toolStatus: TOOL_LABELS[data.tool] || `Using ${data.tool}…`,
              };
              return updated;
            });
          } else if (data.type === "done") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = { ...last, toolStatus: null };
              return updated;
            });
          }
        }
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  const clearChat = () => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setIsLoading(false);
  };

  return (
    <ChatContext.Provider
      value={{ isOpen, setIsOpen, messages, isLoading, sendMessage, clearChat, apiKey, setApiKey }}
    >
      {children}
    </ChatContext.Provider>
  );
}
