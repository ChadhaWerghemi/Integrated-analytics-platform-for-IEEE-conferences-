import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import {
  listSessions,
  getSession,
  saveSession,
  deleteSession,
  titleFromFirstMessage,
} from "../lib/chatStore";
import RobotMascot from "../components/RobotMascot";

const SUGGESTIONS = [
  "What month has the highest attendance?",
  "Which location has the highest attendance?",
  "Which format gets the highest attendance?",
  "Top 3 countries by conference count",
];

// Belt-and-suspenders: the backend already strips these, but if an older
// backend build is running, don't let a stray bracket citation slip through.
const CITATION_RE = /[\u3010[][^\u3011\]\n]{0,80}(?:\u2192|->)[^\u3011\]\n]{0,80}[\u3011\]]/g;
function clean(text) {
  return text.replace(CITATION_RE, "").replace(/\s{2,}/g, " ").trim();
}

// A brand-new chat, kept purely in memory - unlike chatStore's
// createSession(), this does NOT write anything to localStorage. That way,
// just opening the Assistant tab never clutters the sidebar with empty
// "New chat" entries; a chat only gets persisted (via persist(), below)
// once it actually has a message in it.
function draftSession() {
  return {
    id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: "New chat",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export default function AssistantPage() {
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [schema, setSchema] = useState(null);
  const [showSchema, setShowSchema] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [copiedIndex, setCopiedIndex] = useState(null);
  const logRef = useRef(null);
  const inputRef = useRef(null);

  // Every time this page is opened - including navigating away (Home,
  // Recommendations...) and back, which unmounts and remounts it - it
  // starts on a brand-new chat. Past chats are never lost: they're all
  // still listed in the sidebar and one click away via switchChat().
  useEffect(() => {
    setSessions(listSessions());
    const fresh = draftSession();
    setActiveId(fresh.id);
    setMessages([]);
    apiGet("/api/schema").then(setSchema).catch(() => setSchema(null));
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages]);

  // Autofocus the composer whenever a chat becomes active (first load or
  // after switching/creating one), so you can start typing immediately.
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeId]);

  function persist(id, msgs) {
    const existing = getSession(id) || { id, title: "New chat", messages: [] };
    const title = existing.messages.length === 0 && msgs.length > 0
      ? titleFromFirstMessage(msgs[0].content)
      : existing.title;
    const updated = saveSession({ ...existing, title, messages: msgs });
    setSessions(listSessions());
    return updated;
  }

  function newChat() {
    const fresh = draftSession();
    setActiveId(fresh.id);
    setMessages([]);
    setEditingId(null);
  }

  function switchChat(id) {
    const s = getSession(id);
    if (!s) return;
    setActiveId(id);
    setMessages(s.messages);
    setEditingId(null);
  }

  function removeChat(id, e) {
    e.stopPropagation();
    deleteSession(id);
    const remaining = listSessions();
    setSessions(remaining);
    if (id === activeId) {
      if (remaining.length > 0) {
        setActiveId(remaining[0].id);
        setMessages(remaining[0].messages);
      } else {
        newChat();
      }
    }
  }

  function startRename(s, e) {
    e.stopPropagation();
    setEditingId(s.id);
    setEditTitle(s.title);
  }

  function confirmRename() {
    const id = editingId;
    setEditingId(null);
    const trimmed = editTitle.trim();
    if (!trimmed || !id) return;
    const existing = getSession(id);
    if (!existing) return; // nothing saved for this chat yet - nothing to rename
    saveSession({ ...existing, title: trimmed });
    setSessions(listSessions());
  }

  function copyReply(text, i) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedIndex(i);
      setTimeout(() => setCopiedIndex((cur) => (cur === i ? null : cur)), 1400);
    });
  }

  async function send(text) {
    if (!text.trim() || loading || !activeId) return;
    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    persist(activeId, newMessages);
    setInput("");
    setLoading(true);

    try {
      // Calls OUR Flask backend, not Groq directly - the API key lives
      // server-side in app.py's .env, never in this frontend code.
      const data = await apiPost("/api/assistant", { message: text, history: newMessages });
      const withReply = [
        ...newMessages,
        { role: "assistant", content: clean(data.reply), queriesUsed: data.queries_used || [] },
      ];
      setMessages(withReply);
      persist(activeId, withReply);
    } catch (err) {
      const withError = [...newMessages, { role: "assistant", content: `Couldn't reach the backend: ${err.message}` }];
      setMessages(withError);
      persist(activeId, withError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "40px 28px", minHeight: "calc(100vh - 65px)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24, flexWrap: "wrap" }}>
          <RobotMascot width={78} />
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700 }}>Ask AI Assistant</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13.5, marginTop: 4 }}>
              Ask questions in plain language and explore the conference data from different angles — from trends over time to locations, formats, and other details that matter to you.
            </p>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "240px 1fr",
            gap: 16,
            alignItems: "start",
          }}
        >
          {/* ---- CHAT HISTORY SIDEBAR ---- */}
          <div
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface)",
              borderRadius: "var(--radius)",
              overflow: "hidden",
              height: 620,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <button
                onClick={newChat}
                className="glow-hover"
                style={{
                  width: "100%",
                  background: "var(--amber)",
                  color: "#0A1A2B",
                  border: "none",
                  fontWeight: 600,
                  fontSize: 12.5,
                  padding: "9px 0",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                + New chat
              </button>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: 8 }}>
              {sessions.length === 0 && (
                <p style={{ color: "var(--text-dim)", fontSize: 12.5, textAlign: "center", marginTop: 20 }}>
                  No saved chats yet.
                </p>
              )}
              {sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => switchChat(s.id)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 10px",
                    borderRadius: 8,
                    cursor: "pointer",
                    marginBottom: 2,
                    background: s.id === activeId ? "var(--teal-soft)" : "transparent",
                    border: `1px solid ${s.id === activeId ? "#2E7D74" : "transparent"}`,
                  }}
                >
                  {editingId === s.id ? (
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmRename();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={confirmRename}
                      style={{
                        flex: 1,
                        fontSize: 12.5,
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                        borderRadius: 6,
                        padding: "3px 6px",
                        outline: "none",
                        minWidth: 0,
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        fontSize: 12.5,
                        color: s.id === activeId ? "var(--teal)" : "var(--text-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.title}
                    </span>
                  )}
                  {editingId !== s.id && (
                    <span style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                      <button
                        onClick={(e) => startRename(s, e)}
                        title="Rename chat"
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-dim)",
                          cursor: "pointer",
                          fontSize: 12,
                          lineHeight: 1,
                          padding: 2,
                        }}
                      >
                        ✎
                      </button>
                      <button
                        onClick={(e) => removeChat(s.id, e)}
                        title="Delete chat"
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-dim)",
                          cursor: "pointer",
                          fontSize: 13,
                          lineHeight: 1,
                          padding: 2,
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ---- CHAT PANEL ---- */}
          {/* Flexbox, not CSS grid: with grid-template-rows, a conditionally
              rendered child (the schema panel below) shifts every later
              child into the wrong row track, which is what was pushing the
              suggestions/input bar up into the middle of the panel instead
              of pinning it to the bottom. Flex column with the message log
              as the only flex:1 child sidesteps that entirely. */}
          <div
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface)",
              borderRadius: "var(--radius)",
              display: "flex",
              flexDirection: "column",
              height: 620,
            }}
          >
            <div
              style={{
                flexShrink: 0,
                padding: "14px 20px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--text)" }}>
                DATA ASSISTANT &mdash; reads straight from ieee_conferences_dw
              </span>
              <button
                onClick={() => setShowSchema((v) => !v)}
                className="glow-hover"
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--amber)",
                  border: "1px solid #8a611f",
                  background: "var(--amber-soft)",
                  padding: "5px 10px",
                  borderRadius: 999,
                  cursor: "pointer",
                }}
              >
                {schema ? `● ${schema.connection.name}` : "connecting…"} &middot; {showSchema ? "hide" : "what data is this?"}
              </button>
            </div>

            {showSchema && schema && (
              <div
                style={{
                  flexShrink: 0,
                  padding: "16px 20px",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--bg-raised)",
                  fontSize: 12.5,
                  color: "var(--text-muted)",
                  maxHeight: 220,
                  overflowY: "auto",
                }}
              >
                <p style={{ color: "var(--text)", marginBottom: 8 }}>
                  Connected to <strong>{schema.connection.name}</strong> ({schema.connection.engine}) &mdash; {schema.grain}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                  {schema.dimensions.map((d) => (
                    <div key={d.table} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                      <div style={{ color: "var(--teal)", fontFamily: "var(--mono)", fontSize: 11, marginBottom: 4 }}>
                        {d.covers}
                      </div>
                      <div>{d.fields.join(", ")}</div>
                      {d.not_included && (
                        <div style={{ color: "var(--rose)", marginTop: 4, fontSize: 11.5 }}>
                          Not included: {d.not_included.join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p style={{ marginTop: 10, color: "var(--text-dim)" }}>
                  Metrics: {schema.facts.join(", ")}
                </p>
              </div>
            )}

            <div
              ref={logRef}
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              {messages.length === 0 && (
                <div style={{ textAlign: "center", marginTop: 48 }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>👋</div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-h)" }}>
                    Hello! How can I help you today?
                  </h2>
                  <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 8 }}>
                    Ask about categories, countries, hosts, or attendance - by month, by location, or overall.
                  </p>
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    maxWidth: "82%",
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    background: m.role === "user" ? "var(--amber-soft)" : "var(--teal-soft)",
                    border: `1px solid ${m.role === "user" ? "#8a611f" : "var(--border)"}`,
                    borderRadius: 10,
                    padding: "12px 14px",
                    fontSize: 14,
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.content}
                  {m.role === "assistant" && (
                    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <button
                        onClick={() => copyReply(m.content, i)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--text-dim)",
                          fontFamily: "var(--mono)",
                          fontSize: 11,
                          padding: 0,
                        }}
                      >
                        {copiedIndex === i ? "✓ copied" : "copy"}
                      </button>
                      {m.queriesUsed && m.queriesUsed.length > 0 && (
                        <details style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                          <summary style={{ cursor: "pointer", fontFamily: "var(--mono)" }}>
                            🔎 {m.queriesUsed.length} live {m.queriesUsed.length === 1 ? "query" : "queries"} used
                          </summary>
                          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                            {m.queriesUsed.map((q, qi) => (
                              <div
                                key={qi}
                                style={{
                                  fontFamily: "var(--mono)",
                                  background: "var(--bg)",
                                  border: "1px solid var(--border)",
                                  borderRadius: 6,
                                  padding: "6px 8px",
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-word",
                                }}
                              >
                                {q.sql}
                                <div style={{ marginTop: 4, color: "var(--text-dim)" }}>
                                  {q.row_count} row{q.row_count === 1 ? "" : "s"}{q.truncated ? " (truncated)" : ""}
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {loading && <div style={{ color: "var(--text-dim)", fontSize: 13 }}>Thinking...</div>}
            </div>

            {/* Suggestions + composer - pinned to the bottom of the panel. */}
            <div style={{ flexShrink: 0 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 20px 14px" }}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="glow-hover"
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 11.5,
                      color: "var(--teal)",
                      border: "1px solid #2E7D74",
                      background: "var(--teal-soft)",
                      padding: "6px 10px",
                      borderRadius: 20,
                      cursor: "pointer",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, padding: "16px 20px", borderTop: "1px solid var(--border)" }}>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send(input)}
                  placeholder="Ask a question about the data..."
                  style={{
                    flex: 1,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    fontSize: 14,
                    padding: "11px 14px",
                    borderRadius: 8,
                    outline: "none",
                  }}
                />
                <button
                  onClick={() => send(input)}
                  disabled={loading}
                  className="glow-hover"
                  style={{
                    background: loading ? "var(--border)" : "var(--amber)",
                    color: "#0A1A2B",
                    border: "none",
                    fontWeight: 600,
                    fontSize: 12.5,
                    textTransform: "uppercase",
                    padding: "0 20px",
                    borderRadius: 8,
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
