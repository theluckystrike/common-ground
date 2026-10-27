import { createMcpHandler } from "@modelcontextprotocol/server";

import { findCommonGround } from "./group.js";
import { groupInput } from "./input.js";
import { dataSource } from "./runtime.js";
import { createServer } from "./server.js";
import { QlooError } from "./types.js";

interface Env { ASSETS: { fetch: (r: Request) => Promise<Response> }; QLOO_API_KEY?: string }

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id, mcp-method, mcp-name" };

async function apiPick(request: Request, env: Env): Promise<Response> {
  const raw = await request.text();
  if (raw.length > 20_000) return Response.json({ error: "This group is too large." }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: "Send JSON." }, { status: 400 }); }
  const parsed = groupInput.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Choose a category, 2 to 8 different names, and 2 to 5 favourites each. Restaurants need a city." }, { status: 400 });
  const { kind, members, location, tasteFrom } = parsed.data;
  const { qloo, mode, note } = dataSource(env.QLOO_API_KEY);
  if (mode === "demo" && kind === "place" && location?.toLowerCase() !== "warsaw") {
    return Response.json({ error: "Demo restaurants are fictional and limited to Warsaw. Try the Warsaw example." }, { status: 422 });
  }
  try {
    return Response.json({ ...await findCommonGround(qloo, members, kind, location, tasteFrom), mode, note }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    const status = err instanceof QlooError ? err.status : 500;
    const message = err instanceof QlooError ? err.message : "Something went wrong. Please try again.";
    return Response.json({ error: message, mode, note }, { status: status >= 400 && status < 600 ? status : 502 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/mcp") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      const res = await createMcpHandler(() => createServer(env.QLOO_API_KEY)).fetch(request);
      const headers = new Headers(res.headers); for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    }
    if (pathname === "/api/pick") {
      if (request.method !== "POST") return Response.json({ error: "Use POST." }, { status: 405, headers: { allow: "POST" } });
      return apiPick(request, env);
    }
    if (pathname === "/health") {
      const { mode, note } = dataSource(env.QLOO_API_KEY);
      return Response.json({ name: "common-ground", ok: true, mode, note, keyConfigured: mode === "live" }, { headers: { "cache-control": "no-store" } });
    }
    return env.ASSETS.fetch(request);
  },
};
