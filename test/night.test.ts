import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { chooseStops, explainPick, planNight, rankRaw, STOPS } from "../src/night.js";
import { Qloo } from "../src/qloo.js";
import worker from "../src/worker.js";
import type { Entity, ResolvedMember, Scored } from "../src/types.js";

// Real Qloo responses recorded on 27 Oct 2026 for a Lisbon night out, trimmed to the fields the app reads.
const recorded = JSON.parse(readFileSync(new URL("./fixtures/night-lisbon.json", import.meta.url), "utf8")) as {
  city: string; members: Array<{ name: string; likes: string[] }>; responses: Record<string, { status: number; body: unknown }>;
};

function replay(urls: string[] = []): typeof fetch {
  return async (input) => {
    const u = new URL(String(input));
    urls.push(u.pathname + u.search);
    const hit = recorded.responses[u.pathname + u.search];
    if (!hit) throw new Error(`No recorded response for ${u.pathname + u.search}`);
    return new Response(JSON.stringify(hit.body), { status: hit.status, headers: { "content-type": "application/json" } });
  };
}

const ent = (id: string, name = id): Entity => ({ id, name, kind: "artist", tags: [] });
const member = (name: string, ...ids: string[]): ResolvedMember => ({ name, liked: ids.map((id) => ent(id)), unresolved: [] });
const scored = (id: string, min: number): Scored => ({ entity: { ...ent(id), kind: "place" }, perMember: { A: min }, min, mean: min });

test("a recorded Lisbon night plan gives dinner, drinks and live music at three different venues", async () => {
  const urls: string[] = [];
  const plan = await planNight(new Qloo("test-key", replay(urls)), recorded.members, recorded.city);
  assert.deepEqual(plan.stops.map((s) => s.key), ["dinner", "drinks", "music"]);
  assert.deepEqual(plan.stops.map((s) => s.winner.entity.name), ["Bar Terraço de Santa Luzia", "Rua nova do Carvalho", "Lusophonica - Farol De Santa Marta"]);
  assert.equal(new Set(plan.stops.map((s) => s.winner.entity.id)).size, 3);
  assert.deepEqual(plan.trace, { ...plan.trace, searches: 8, insights: 15 });
  // Favourites come from four domains and keep the type Qloo returned.
  assert.deepEqual(new Set(plan.members.flatMap((m) => m.liked.map((e) => e.kind))), new Set(["artist", "movie", "tv_show", "book"]));
});

test("every stop names the favourites behind it and each friend's share of the pick", async () => {
  const plan = await planNight(new Qloo("test-key", replay()), recorded.members, recorded.city);
  const names = new Set(recorded.members.map((m) => m.name));
  for (const stop of plan.stops) {
    assert.ok(stop.because.length > 0 && stop.because.length <= 3);
    for (const b of stop.because) assert.ok(b.friends.every((f) => names.has(f)));
    const total = Object.values(stop.influence).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `influence sums to ${total}`);
    assert.equal(stop.winner.min, Math.min(...Object.values(stop.winner.perMember)));
    for (const alt of stop.alternatives) assert.ok(alt.min <= stop.winner.min);
  }
  assert.equal(plan.stops[0]!.because[0]!.name, "Radiohead");
  assert.deepEqual(plan.stops[0]!.because[0]!.friends, ["Ana"]);
});

test("night plan asks Qloo for explainability once per stop and scores each friend on that pool", async () => {
  const urls: string[] = [];
  await planNight(new Qloo("test-key", replay(urls)), recorded.members, recorded.city);
  const insights = urls.filter((u) => u.startsWith("/v2/insights")).map((u) => new URL(u, "https://x.test").searchParams);
  for (const stop of STOPS) {
    const forStop = insights.filter((p) => p.get("filter.tags") === stop.tag);
    assert.equal(forStop.length, 1 + recorded.members.length);
    assert.equal(forStop.filter((p) => p.get("feature.explainability") === "true").length, 1);
    assert.ok(forStop.every((p) => p.get("filter.location.query") === "Lisbon" && p.get("filter.type") === "urn:entity:place"));
    const pool = forStop.find((p) => p.has("filter.results.entities"))!.get("filter.results.entities")!.split(",");
    assert.ok(pool.length > 0 && pool.length <= 25);
  }
});

test("explainPick splits a shared favourite between friends and ignores ids that are not favourites", () => {
  const members = [member("Ana", "a", "shared"), member("Tom", "t", "shared")];
  const { because, influence } = explainPick([{ id: "shared", score: 0.4 }, { id: "a", score: 0.4 }, { id: "t", score: 0.2 }, { id: "stranger", score: 0.9 }], members);
  assert.deepEqual(because.map((b) => [b.name, b.friends]), [["a", ["Ana"]], ["shared", ["Ana", "Tom"]], ["t", ["Tom"]]]);
  assert.ok(Math.abs(influence["Ana"]! - 0.6) < 1e-9);
  assert.ok(Math.abs(influence["Tom"]! - 0.4) < 1e-9);
});

test("explainPick without explainability gives no reasons and no influence", () => {
  const { because, influence } = explainPick([], [member("Ana", "a"), member("Tom", "t")]);
  assert.deepEqual(because, []);
  assert.deepEqual({ ...influence }, { Ana: 0, Tom: 0 });
});

test("chooseStops never sends the group to the same venue twice", () => {
  const out = chooseStops([[scored("v1", 0.9), scored("v2", 0.8)], [scored("v1", 0.95), scored("v3", 0.7), scored("v4", 0.6)], [scored("v1", 0.9)]]);
  assert.equal(out[0]!.winner.entity.id, "v1");
  assert.equal(out[1]!.winner.entity.id, "v3");
  assert.deepEqual(out[1]!.alternatives.map((a) => a.entity.id), ["v4"]);
  assert.equal(out[2], null);
});

test("rankRaw keeps raw affinity, counts a missing score as 0, and ranks by the least happy friend", () => {
  const c = (id: string, affinity: number) => ({ entity: { ...ent(id), kind: "place" as const }, affinity });
  const ranked = rankRaw({ Ana: [c("x", 0.9), c("y", 0.7)], Tom: [c("y", 0.72), c("z", 0.99)] }, ["x", "y", "z"]);
  assert.deepEqual(ranked.map((s) => [s.entity.id, s.min]), [["y", 0.7], ["z", 0], ["x", 0]]);
  assert.equal(ranked[2]!.mean, 0.45);
});

test("/api/night validates input, needs a key, and reuses a recent plan without new Qloo calls", async () => {
  const env = { ASSETS: { fetch: async () => new Response("asset") } };
  const post = (body: unknown, e: object = env) => worker.fetch(new Request("https://example.test/api/night", {
    method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  }), e as typeof env);
  assert.equal((await post({ city: "Lisbon", members: [{ name: "Ana", likes: ["Radiohead"] }] })).status, 400);
  assert.equal((await post({ members: recorded.members })).status, 400);
  assert.equal((await post({ city: "Lisbon", members: recorded.members })).status, 503);
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = replay(urls);
  try {
    const live = { ...env, QLOO_API_KEY: "test-key" };
    const first = await post({ city: "Lisbon", members: recorded.members }, live);
    assert.equal(first.status, 200);
    const data = await first.json() as any;
    assert.equal(data.cached, false);
    assert.equal(data.stops.length, 3);
    const calls = urls.length;
    const again = await post({ city: "lisbon", members: recorded.members }, live);
    assert.equal((await again.json() as any).cached, true);
    assert.equal(urls.length, calls);
  } finally { globalThis.fetch = original; }
});

test("MCP lists plan_night_out next to find_common_ground", async () => {
  const env = { ASSETS: { fetch: async () => new Response("asset") } };
  const res = await worker.fetch(new Request("https://example.test/mcp", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  }), env);
  const text = await res.text();
  assert.match(text, /plan_night_out/);
  assert.match(text, /find_common_ground/);
});

test("a slow Qloo answer is retried once before the user sees an error", async () => {
  let calls = 0;
  const fetchFn: typeof fetch = async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    return new Response(JSON.stringify({ results: { entities: [{ entity_id: "v1", name: "Venue", query: { affinity: 0.8, explainability: { "signal.interests.entities": [{ entity_id: "a", score: 0.7 }] } } }] } }));
  };
  const out = await new Qloo("test-key", fetchFn).insights([ent("a")], "place", { take: 5, location: "Lisbon", explain: true });
  assert.equal(calls, 2);
  assert.deepEqual(out[0]!.explain, [{ id: "a", score: 0.7 }]);
});
