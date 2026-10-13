/**
 * Multi-session chat history, persisted to localStorage so switching tabs
 * (or reloading the page) no longer wipes the conversation. Each session
 * is titled from its first user message, newest first.
 */

const KEY = "conferencePulse.chatSessions.v1";

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(sessions) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sessions));
  } catch {
    // storage unavailable (private browsing, quota, etc.) - fail silently,
    // the chat still works for the current tab, it just won't persist.
  }
}

export function listSessions() {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(id) {
  return readAll().find((s) => s.id === id) || null;
}

export function createSession() {
  const session = {
    id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: "New chat",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const all = readAll();
  all.push(session);
  writeAll(all);
  return session;
}

export function saveSession(session) {
  const all = readAll();
  const idx = all.findIndex((s) => s.id === session.id);
  const updated = { ...session, updatedAt: Date.now() };
  if (idx >= 0) all[idx] = updated;
  else all.push(updated);
  writeAll(all);
  return updated;
}

export function deleteSession(id) {
  writeAll(readAll().filter((s) => s.id !== id));
}

export function titleFromFirstMessage(text) {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > 42 ? `${clean.slice(0, 42)}\u2026` : clean || "New chat";
}
