import { createMcpHandler } from "@modelcontextprotocol/server";

import { findCommonGround } from "./group.js";
import { Qloo } from "./qloo.js";
import { createServer } from "./server.js";
import { QlooError, type Kind, type Member } from "./types.js";

interface Env { ASSETS: { fetch: (r: Request) => Promise<Response> }; QLOO_API_KEY?: string }

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id, mcp-method, mcp-name" };

async function apiPick(request: Request, env: Env): Promise<Response> {
  if (!env.QLOO_API_KEY) return Response.json({ error: "The demo has no Qloo API key configured yet." }, { status: 503 });
  let body: { kind?: Kind; location?: string; members?: Member[] };
  try { body = JSON.parse((await request.text()).slice(0, 20_000)); } catch { return Response.json({ error: "Send JSON." }, { status: 400 }); }
  if (!body.kind || !Array.isArray(body.members)) return Response.json({ error: "Choose what to pick and add people." }, { status: 400 });
  try {
    return Response.json(await findCommonGround(new Qloo(env.QLOO_API_KEY), body.members, body.kind, body.location));
  } catch (err) {
    const status = err instanceof QlooError ? err.status : 500;
    const message = err instanceof QlooError ? err.message : "Something went wrong. Please try again.";
    return Response.json({ error: message }, { status: status >= 400 && status < 600 ? status : 502 });
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
    if (pathname === "/api/pick" && request.method === "POST") return apiPick(request, env);
    if (pathname === "/health") return Response.json({ name: "common-ground", ok: true, key: Boolean(env.QLOO_API_KEY) });
    return env.ASSETS.fetch(request);
  },
};
