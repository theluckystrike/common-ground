import { test } from "node:test";
import assert from "node:assert/strict";

import { Qloo } from "../src/qloo.js";
import { QlooError, type Entity } from "../src/types.js";

const BASE = "https://hackathon.api.qloo.com";

type Call = { url: string; init?: RequestInit };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function client(body: unknown, status = 200): { qloo: Qloo; calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return jsonResponse(body, status);
  };
  return { qloo: new Qloo("test-key", fetchFn), calls };
}

function headers(init?: RequestInit): Record<string, string> {
  return (init?.headers ?? {}) as Record<string, string>;
}

test("search returns the best match of the requested type mapped to an Entity", async () => {
  const { qloo } = client({
    success: true,
    results: {
      entities: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          name: "Prisoners",
          entity_type: "urn:entity:movie",
          tags: ["urn:tag:genre:media:thriller", "urn:tag:genre:media:drama"],
          properties: { image: "https://img.example/prisoners.jpg", release_year: 2013 },
        },
        {
          id: "22222222-2222-2222-2222-222222222222",
          name: "Prisoners (book)",
          entity_type: "urn:entity:book",
          tags: [],
        },
      ],
      duration: 0.03,
    },
  });
  const entity = await qloo.search("Prisoners", "movie");
  assert.ok(entity);
  assert.equal(entity.id, "11111111-1111-1111-1111-111111111111");
  assert.equal(entity.name, "Prisoners");
  assert.equal(entity.kind, "movie");
  assert.deepEqual(entity.tags, ["thriller", "drama"]);
  assert.equal(entity.year, 2013);
  assert.equal(entity.image, "https://img.example/prisoners.jpg");
});

test("search returns null when nothing matches", async () => {
  const { qloo } = client({ success: true, results: { entities: [], duration: 0.01 } });
  assert.equal(await qloo.search("Missing", "movie"), null);
});

test("search returns null when no result has the requested type", async () => {
  const { qloo } = client({
    success: true,
    results: { entities: [{ id: "id-1", name: "A Book", entity_type: "urn:entity:book", tags: [] }], duration: 0.01 },
  });
  assert.equal(await qloo.search("A Book", "movie"), null);
});

test("search caps tags to 12 names and dedupes", async () => {
  const tags = Array.from({ length: 15 }, (_, i) => `urn:tag:genre:media:tag_${i}`);
  const { qloo } = client({
    success: true,
    results: { entities: [{ id: "id-1", name: "X", entity_type: "urn:entity:movie", tags }], duration: 0.01 },
  });
  const entity = await qloo.search("X", "movie");
  assert.ok(entity);
  assert.equal(entity.tags.length, 12);
  assert.deepEqual(entity.tags[0], "tag_0");
});

test("search requests the documented path, parameters and auth header", async () => {
  const { qloo, calls } = client({ success: true, results: { entities: [], duration: 0.01 } });
  await qloo.search("Interstellar", "movie");
  assert.equal(calls.length, 1);
  const url = new URL(calls[0]!.url);
  assert.equal(url.origin + url.pathname, `${BASE}/search`);
  assert.equal(url.searchParams.get("types"), "urn:entity:movie");
  assert.equal(url.searchParams.get("q"), "Interstellar");
  assert.equal(headers(calls[0]!.init)["X-Api-Key"], "test-key");
  assert.ok(calls[0]!.init?.signal, "a timeout signal is attached");
  assert.ok(!calls[0]!.url.includes("test-key"), "the key never appears in the URL");
});

test("insights requests the documented path and parameters", async () => {
  const { qloo, calls } = client({ success: true, results: { entities: [], duration: 0.01 } });
  const liked: Entity[] = [
    { id: "a", name: "Prisoners", kind: "movie", tags: ["thriller"] },
    { id: "b", name: "Seven", kind: "movie", tags: ["thriller"] },
  ];
  await qloo.insights(liked, "movie", { take: 50 });
  const url = new URL(calls[0]!.url);
  assert.equal(url.origin + url.pathname, `${BASE}/v2/insights`);
  assert.equal(url.searchParams.get("filter.type"), "urn:entity:movie");
  assert.equal(url.searchParams.get("signal.interests.entities"), "a,b");
  assert.equal(url.searchParams.get("take"), "50");
  assert.equal(headers(calls[0]!.init)["X-Api-Key"], "test-key");
});

test("insights maps entities and normalises percent affinity to 0..1", async () => {
  const { qloo } = client({
    success: true,
    results: {
      entities: [
        {
          id: "uuid-1",
          name: "Dune: Part Two",
          entity_type: "urn:entity:movie",
          tags: ["urn:tag:genre:media:science_fiction"],
          properties: { release_year: 2024 },
          query: { affinity: 85 },
        },
        {
          id: "uuid-2",
          name: "Blade Runner 2049",
          entity_type: "urn:entity:movie",
          tags: [],
          query: { affinity: 0.7 },
        },
      ],
      duration: 0.05,
    },
  });
  const list = await qloo.insights([], "movie", { take: 10 });
  assert.equal(list.length, 2);
  assert.equal(list[0]!.entity.name, "Dune: Part Two");
  assert.equal(list[0]!.entity.kind, "movie");
  assert.equal(list[0]!.entity.year, 2024);
  assert.deepEqual(list[0]!.entity.tags, ["science_fiction"]);
  assert.equal(list[0]!.affinity, 0.85);
  assert.equal(list[1]!.affinity, 0.7);
});

test("insights returns an empty array for empty results", async () => {
  const { qloo } = client({ success: true, results: { entities: [], duration: 0.01 } });
  assert.deepEqual(await qloo.insights([], "movie", { take: 10 }), []);
});

test("insights maps a missing affinity to 0", async () => {
  const { qloo } = client({
    success: true,
    results: { entities: [{ id: "uuid-1", name: "No Score", entity_type: "urn:entity:movie", tags: [] }], duration: 0.01 },
  });
  const list = await qloo.insights([], "movie", { take: 10 });
  assert.equal(list.length, 1);
  assert.equal(list[0]!.affinity, 0);
});

test("insights clamps take to the documented maximum of 50", async () => {
  const { qloo, calls } = client({ success: true, results: { entities: [], duration: 0.01 } });
  await qloo.insights([], "book", { take: 100 });
  assert.equal(new URL(calls[0]!.url).searchParams.get("take"), "50");
  await qloo.insights([], "book", { take: 0 });
  assert.equal(new URL(calls[1]!.url).searchParams.get("take"), "1");
});

test("insights sends filter.location.query only for place", async () => {
  const { qloo, calls } = client({ success: true, results: { entities: [], duration: 0.01 } });
  await qloo.insights([], "place", { take: 10, location: "Warsaw" });
  assert.equal(new URL(calls[0]!.url).searchParams.get("filter.location.query"), "Warsaw");
  await qloo.insights([], "movie", { take: 10, location: "Warsaw" });
  assert.equal(new URL(calls[1]!.url).searchParams.get("filter.location.query"), null);
});

test("401 throws a QlooError that tells the caller to check the base URL and key", async () => {
  const { qloo } = client({ error: "Unauthorized" }, 401);
  await assert.rejects(qloo.search("Seven", "movie"), (err) => {
    assert.ok(err instanceof QlooError);
    assert.equal((err as QlooError).status, 401);
    assert.match((err as QlooError).message, /base URL/);
    assert.match((err as QlooError).message, /QLOO_API_KEY/);
    return true;
  });
});

test("403 throws a QlooError that tells the caller to check the base URL and key", async () => {
  const { qloo } = client({ error: "Forbidden" }, 403);
  await assert.rejects(qloo.search("Seven", "movie"), (err) => {
    assert.ok(err instanceof QlooError);
    assert.equal((err as QlooError).status, 403);
    assert.match((err as QlooError).message, /base URL/);
    return true;
  });
});

test("429 throws a QlooError with the rate-limit status", async () => {
  const { qloo } = client({ error: "Too Many Requests" }, 429);
  await assert.rejects(qloo.insights([], "movie", { take: 10 }), (err) => {
    assert.ok(err instanceof QlooError);
    assert.equal((err as QlooError).status, 429);
    return true;
  });
});

test("other non-2xx statuses throw a QlooError carrying the status", async () => {
  const { qloo } = client({ error: "boom" }, 500);
  await assert.rejects(qloo.search("X", "movie"), (err) => {
    assert.ok(err instanceof QlooError);
    assert.equal((err as QlooError).status, 500);
    return true;
  });
});

test("a timeout (aborted fetch) surfaces as a 504 QlooError", async () => {
  const fetchFn: typeof fetch = async () => {
    throw new DOMException("The operation was aborted.", "AbortError");
  };
  const qloo = new Qloo("test-key", fetchFn);
  await assert.rejects(qloo.search("X", "movie"), (err) => {
    assert.ok(err instanceof QlooError);
    assert.equal((err as QlooError).status, 504);
    assert.match((err as QlooError).message, /5 seconds/);
    return true;
  });
});

test("a network failure surfaces as a 502 QlooError", async () => {
  const fetchFn: typeof fetch = async () => {
    throw new TypeError("fetch failed");
  };
  const qloo = new Qloo("test-key", fetchFn);
  await assert.rejects(qloo.search("X", "movie"), (err) => {
    assert.ok(err instanceof QlooError);
    assert.equal((err as QlooError).status, 502);
    return true;
  });
});

test("the constructor base override is honoured", async () => {
  const { qloo, calls } = (() => {
    const calls: Call[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return jsonResponse({ success: true, results: { entities: [], duration: 0.01 } });
    };
    return { qloo: new Qloo("test-key", fetchFn, "https://example.com"), calls };
  })();
  await qloo.search("X", "movie");
  assert.ok(calls[0]!.url.startsWith("https://example.com/search"));
});
