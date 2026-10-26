import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { catalogues, fixtureFetch } from "../src/fixtures/qloo.js";
import { dataSource } from "../src/runtime.js";
import { findCommonGround } from "../src/group.js";
import { Qloo } from "../src/qloo.js";
import { QlooError, type Kind } from "../src/types.js";

const env = { ASSETS: { fetch: async () => new Response("asset") } };
const members = [
  { name: "Ana", likes: ["Prisoners", "Gone Girl"] },
  { name: "Tom", likes: ["Interstellar", "Inception"] },
];
const input = { kind: "movie", members };
const post = (body: unknown) => new Request("https://example.test/api/pick", {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
});

test("health reports demo mode without exposing credentials", async () => {
  const res = await worker.fetch(new Request("https://example.test/health"), env);
  const data = await res.json() as { mode: string; keyConfigured: boolean };
  assert.equal(data.mode, "demo");
  assert.equal(data.keyConfigured, false);
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("keyless Worker completes a labelled synthetic pick using per-person scores", async () => {
  const res = await worker.fetch(post(input), env);
  assert.equal(res.status, 200);
  const data = await res.json() as any;
  assert.equal(data.mode, "demo");
  assert.match(data.note, /synthetic fixtures/);
  assert.equal(data.pick.winner.entity.name, "Arrival");
  assert.equal(Object.keys(data.pick.winner.perMember).length, 2);
  assert.equal(data.pick.runnersUp.length, 3);
  assert.equal(data.pick.winner.min, 0.82);
});

test("demo replays documented search and insights envelopes", async () => {
  const search = await fixtureFetch("https://example.test/search?types=urn:entity:movie&query=Prisoners");
  const body = await search.json() as any;
  assert.equal(body.success, true);
  assert.equal(typeof body.duration, "number");
  assert.ok(Array.isArray(body.results));
  const insights = await fixtureFetch("https://example.test/v2/insights?filter.type=urn:entity:movie");
  const result = await insights.json() as any;
  assert.ok(Array.isArray(result.results.entities));
  assert.equal(typeof result.results.duration, "number");
  assert.ok(result.results.entities.every((e: any) => e.query.affinity >= 0 && e.query.affinity <= 1));
});

test("all supported demo categories run the same search, insights and fairness code", async () => {
  for (const kind of Object.keys(catalogues) as Kind[]) {
    const seeds = catalogues[kind].seeds;
    const group = [
      { name: "A", likes: seeds.slice(0, 2).map((e) => e.name) },
      { name: "B", likes: seeds.slice(-2).map((e) => e.name) },
    ];
    const res = await worker.fetch(post({ kind, members: group, ...(kind === "place" ? { location: "Warsaw" } : {}) }), env);
    assert.equal(res.status, 200, kind);
    assert.equal((await res.json() as any).mode, "demo");
  }
});

test("demo never invents matches for unknown likes", async () => {
  const res = await worker.fetch(post({ ...input, members: [{ name: "A", likes: ["missing one", "missing two"] }, members[1]] }), env);
  assert.equal(res.status, 422);
});

test("demo rejects restaurant requests outside its fixture location", async () => {
  const res = await worker.fetch(post({ ...input, kind: "place", location: "Tokyo" }), env);
  assert.equal(res.status, 422);
});

test("invalid inputs and duplicate names are rejected before any Qloo request", async () => {
  for (const body of [null, {}, { ...input, kind: "unknown" }, { ...input, members: [members[0], members[0]] }, { ...input, members: [{ name: "Ana", likes: [1, 2] }, members[1]] }]) {
    assert.equal((await worker.fetch(post(body), env)).status, 400);
  }
  assert.equal((await worker.fetch(new Request("https://example.test/api/pick", { method: "POST", body: "{" }), env)).status, 400);
  assert.equal((await worker.fetch(new Request("https://example.test/api/pick", { method: "POST", body: "x".repeat(20_001) }), env)).status, 413);
});

test("lookup authentication errors survive group resolution", async () => {
  const qloo = new Qloo("", async () => Response.json({}, { status: 401 }));
  await assert.rejects(findCommonGround(qloo, members, "movie"), (err) => err instanceof QlooError && err.status === 401);
});

test("a configured key uses real fetch and never falls back to synthetic data", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); return Response.json({}, { status: 429 }); };
  try {
    const source = dataSource("test-key");
    assert.equal(source.mode, "live");
    const res = await worker.fetch(post(input), { ...env, QLOO_API_KEY: "test-key" });
    assert.equal(res.status, 429);
    assert.equal((await res.json() as any).mode, "live");
    assert.ok(calls.every((url) => url.startsWith("https://hackathon.api.qloo.com/search?")));
  } finally { globalThis.fetch = original; }
});

test("MCP tool list exposes the agent tool and calls work without a key", async () => {
  const rpc = (body: unknown) => worker.fetch(new Request("https://example.test/mcp", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify(body),
  }), env);
  const list = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  assert.equal(list.status, 200);
  assert.match(await list.text(), /find_common_ground/);
  const call = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "find_common_ground", arguments: input } });
  assert.equal(call.status, 200);
  const result = await call.text();
  assert.match(result, /Arrival/);
  assert.match(result, /synthetic fixtures/);
});
