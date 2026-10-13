export const API_BASE = "http://localhost:5000";

export async function apiGet(path) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`);
  } catch {
    // The fetch itself failed - this is the only case that's actually
    // "couldn't reach the API" (server down, wrong port, CORS blocked).
    throw new Error("UNREACHABLE");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // The server responded, it's just an error - surface its real
    // message instead of masking every failure as "unreachable".
    throw new Error(data.error || `GET ${path} failed (${res.status})`);
  }
  return data;
}

export async function apiPost(path, body) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("UNREACHABLE");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `POST ${path} failed (${res.status})`);
  return data;
}
