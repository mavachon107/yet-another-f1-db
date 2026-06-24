import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useChat } from "../context/ChatContext.jsx";

/** Render lightweight markdown: links, bold, italic. */
function ChatMarkdown({ text }) {
  if (!text) return null;

  // Split on markdown link pattern [text](url)
  const parts = [];
  let remaining = text;
  const linkRe = /\[([^\]]+)\]\(\/([^)]+)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = linkRe.exec(text)) !== null) {
    // Push text before the link
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "link", label: match[1], to: `/` + match[2] });
    lastIndex = linkRe.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  return parts.map((part, i) => {
    if (part.type === "link") {
      return <Link key={i} to={part.to} className="chat-link">{part.label}</Link>;
    }
    // Handle bold and italic in text fragments
    return <span key={i}>{formatInline(part.value)}</span>;
  });
}

function formatInline(text) {
  // Bold **text** then italic _text_
  const parts = [];
  const re = /(\*\*(.+?)\*\*)|(_(.+?)_)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2]) parts.push(<strong key={m.index}>{m[2]}</strong>);
    else if (m[4]) parts.push(<em key={m.index}>{m[4]}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

const SUGGESTIONS = [
  "How many wins does Hamilton have?",
  "Who won the 1994 championship?",
  "Compare Senna and Prost",
];

export default function ChatWidget() {
  const { isOpen, setIsOpen, messages, isLoading, sendMessage, clearChat, apiKey, setApiKey } = useChat();
  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [keyInput, setKeyInput] = useState(apiKey);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput("");
  };

  const handleSuggestion = (text) => {
    sendMessage(text);
  };

  return (
    <>
      {/* Floating bubble button */}
      <button
        type="button"
        className="chat-bubble-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Close chat" : "Ask about F1"}
        title="Ask about F1"
      >
        {isOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="chat-panel">
          <div className="chat-panel-header">
            <span className="chat-panel-title">Ask about F1</span>
            <div className="chat-header-actions">
              {messages.length > 0 && (
                <button type="button" className="chat-clear-btn" onClick={clearChat} title="Clear chat">
                  Clear
                </button>
              )}
              <button
                type="button"
                className="chat-clear-btn"
                onClick={() => { setShowSettings(!showSettings); setKeyInput(apiKey); }}
                title="API key settings"
              >
                {apiKey ? "Key ✓" : "Set key"}
              </button>
            </div>
          </div>

          {showSettings && (
            <div className="chat-settings">
              <label className="chat-settings-label">Anthropic API Key</label>
              <p className="chat-settings-hint">
                Your key is stored locally in your browser and sent directly to Anthropic. It is never stored on the server.
              </p>
              <div className="chat-settings-row">
                <input
                  type="password"
                  className="chat-input"
                  placeholder="sk-ant-…"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                />
                <button
                  type="button"
                  className="chat-send-btn"
                  onClick={() => { setApiKey(keyInput); setShowSettings(false); }}
                  aria-label="Save"
                >
                  Save
                </button>
              </div>
              {apiKey && (
                <button
                  type="button"
                  className="chat-clear-btn chat-remove-key"
                  onClick={() => { setApiKey(""); setKeyInput(""); }}
                >
                  Remove key
                </button>
              )}
            </div>
          )}

          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                <p className="chat-empty-text">Ask me anything about Formula 1 history and statistics.</p>
                <div className="chat-suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="chat-suggestion"
                      onClick={() => handleSuggestion(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
                <div className={`chat-msg-content${msg.isError ? " chat-msg-error" : ""}`}>
                  {msg.role === "assistant" ? <ChatMarkdown text={msg.content} /> : msg.content}
                  {msg.toolStatus && (
                    <div className="chat-tool-status">
                      <span className="chat-tool-spinner" />
                      {msg.toolStatus}
                    </div>
                  )}
                  {/* Show spinner for empty assistant messages that are loading */}
                  {msg.role === "assistant" && !msg.content && !msg.toolStatus && isLoading && i === messages.length - 1 && (
                    <div className="chat-tool-status">
                      <span className="chat-tool-spinner" />
                      Thinking…
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-input-area" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              className="chat-input"
              placeholder="Ask a question…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
            />
            <button
              type="submit"
              className="chat-send-btn"
              disabled={isLoading || !input.trim()}
              aria-label="Send"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
