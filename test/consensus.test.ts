import { test } from "node:test";
import assert from "node:assert/strict";

import { pick, score } from "../src/consensus.js";
import type { Entity, ResolvedMember, Scored } from "../src/types.js";

function ent(id: string, name: string, tags: string[] = []): Entity {
  return { id, name, kind: "movie", tags };
}

function cand(entity: Entity, affinity: number) {
  return { entity, affinity };
}

function member(name: string, liked: Entity[] = []): ResolvedMember {
  return { name, liked, unresolved: [] };
}

function approx(actual: number, expected: number, msg?: string) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${msg ?? "approx"} expected ${expected}, got ${actual}`);
}

function byId(scored: Scored[], id: string): Scored {
  const found = scored.find((s) => s.entity.id === id);
  assert.ok(found, `missing candidate ${id}`);
  return found;
}

test("score: two members normalise to 0..1 and sort by min then mean", () => {
  const x = ent("x", "Inception", ["mind-bending", "thriller"]);
  const y = ent("y", "Interstellar", ["space", "thriller"]);
  const scored = score({
    Ana: [cand(x, 1.0), cand(y, 0.6)],
    Tom: [cand(x, 0.7), cand(y, 1.0)],
  });
  assert.equal(scored.length, 2);
  assert.equal(scored[0]!.entity.id, "x");
  approx(scored[0]!.min, 0.7);
  approx(scored[0]!.mean, 0.85);
  approx(byId(scored, "x").perMember["Ana"] ?? 0, 1.0);
  approx(byId(scored, "y").min, 0.6);
  approx(byId(scored, "y").mean, 0.8);
});

test("score: three members", () => {
  const a = ent("a", "Amelie", []);
  const b = ent("b", "Babel", []);
  const scored = score({
    Ana: [cand(a, 1.0), cand(b, 0.6)],
    Tom: [cand(a, 0.7), cand(b, 1.0)],
    Sue: [cand(a, 1.0), cand(b, 0.5)],
  });
  assert.equal(scored.length, 2);
  assert.equal(scored[0]!.entity.id, "a");
  approx(scored[0]!.min, 0.7);
  approx(scored[0]!.mean, 0.9);
  approx(byId(scored, "b").min, 0.5);
});

test("score: six members, everyone-likes beats personal favourites", () => {
  const shared = ent("shared", "The Godfather", []);
  const alt = ent("alt", "Parasite", []);
  const per: Record<string, { entity: Entity; affinity: number }[]> = {};
  for (let i = 0; i < 6; i += 1) {
    per[`P${i + 1}`] = [cand(shared, 0.8), cand(alt, 0.6), cand(ent(`f${i}`, `Fav ${i}`, []), 1.0)];
  }
  const scored = score(per);
  assert.equal(scored.length, 8);
  assert.equal(scored[0]!.entity.id, "shared");
  assert.equal(scored[1]!.entity.id, "alt");
  approx(scored[0]!.min, 0.8);
  approx(scored[0]!.mean, 0.8);
  approx(scored[1]!.min, 0.6);
});

test("score: candidate loved by 4 and hated by 1 loses to one everyone likes", () => {
  const blockbuster = ent("bb", "Blockbuster", []);
  const indie = ent("indie", "Indie Gem", []);
  const love = [cand(blockbuster, 1.0), cand(indie, 0.6)];
  const scored = score({
    A: [...love],
    B: [...love],
    C: [...love],
    D: [...love],
    E: [cand(blockbuster, 0.0), cand(indie, 1.0)],
  });
  assert.equal(scored.length, 2);
  assert.equal(scored[0]!.entity.id, "indie");
  approx(scored[0]!.min, 0.6);
  approx(byId(scored, "bb").min, 0.0);
});

test("score: ties break by name ascending", () => {
  const alpha = ent("a2", "Alpha", []);
  const beta = ent("b2", "Beta", []);
  const scored = score({
    Ana: [cand(alpha, 0.7), cand(beta, 0.7)],
    Tom: [cand(alpha, 0.4), cand(beta, 0.4)],
  });
  assert.equal(scored.length, 2);
  assert.equal(scored[0]!.entity.name, "Alpha");
  assert.equal(scored[1]!.entity.name, "Beta");
});

test("score: empty input returns empty", () => {
  assert.deepEqual(score({}), []);
  assert.deepEqual(score({ Ana: [] }), []);
});

test("score: member with an empty list scores 0 for every candidate", () => {
  const x = ent("x", "X", []);
  const scored = score({ Ana: [cand(x, 0.5)], Ben: [] });
  assert.equal(scored.length, 1);
  const s = scored[0]!;
  approx(s.perMember["Ana"] ?? 0, 1.0);
  approx(s.perMember["Ben"] ?? 0, 0.0);
  approx(s.min, 0.0);
  approx(s.mean, 0.5);
});

test("score: duplicate entities within a member collapse to the max affinity", () => {
  const x = ent("x", "X", []);
  const y = ent("y", "Y", []);
  const scored = score({
    Ana: [cand(x, 0.9), cand(x, 0.3), cand(y, 0.5)],
    Tom: [cand(x, 0.4), cand(y, 0.8)],
  });
  assert.equal(scored.length, 2);
  assert.equal(scored[0]!.entity.id, "y");
  approx(byId(scored, "x").perMember["Ana"] ?? 0, 1.0);
  approx(byId(scored, "y").perMember["Ana"] ?? 0, 0.5 / 0.9);
});

test("pick: removes already-liked candidates and returns next three runners-up", () => {
  const x = ent("x", "X", []);
  const y = ent("y", "Y", []);
  const z = ent("z", "Z", []);
  const w = ent("w", "W", []);
  const v = ent("v", "V", []);
  const scored: Scored[] = [x, y, z, w, v].map((e, i) => ({
    entity: e,
    perMember: { Ana: 1 - i * 0.1, Tom: 1 - i * 0.1 },
    min: 1 - i * 0.1,
    mean: 1 - i * 0.1,
  }));
  const p = pick(scored, [member("Ana", [x])]);
  assert.equal(p.winner.entity.id, "y");
  assert.deepEqual(p.runnersUp.map((r) => r.entity.id), ["z", "w", "v"]);
});

test("pick: throws when every candidate is already liked", () => {
  const x = ent("x", "X", []);
  const scored: Scored[] = [{ entity: x, perMember: { Ana: 1 }, min: 1, mean: 1 }];
  assert.throws(() => pick(scored, [member("Ana", [x])]), /No candidates/);
});

test("pick: why explains shared tags", () => {
  const winner = ent("w", "Seven", ["slow-burn", "thriller"]);
  const scored: Scored[] = [{ entity: winner, perMember: { Ana: 1 }, min: 1, mean: 1 }];
  const p = pick(scored, [member("Ana", [ent("l1", "Prisoners", ["slow-burn", "thriller"])])]);
  assert.equal(p.why["Ana"], "Ana likes slow-burn, thriller like Prisoners, and this is one.");
});

test("pick: why falls back to strongest liked when there is no tag overlap", () => {
  const winner = ent("w", "Ratatouille", ["food"]);
  const scored: Scored[] = [{ entity: winner, perMember: { Tom: 1 }, min: 1, mean: 1 }];
  const tom = member("Tom", [ent("i", "Interstellar", ["space"]), ent("j", "Jurassic Park", ["dinosaurs"])]);
  const p = pick(scored, [tom]);
  assert.equal(p.why["Tom"], "Closest to Tom's love of Interstellar.");
});

test("pick: fairness names the least happy person and the next best option", () => {
  const win = ent("win", "Winner", []);
  const run = ent("run", "Runner", []);
  const winner: Scored = { entity: win, perMember: { Ana: 0.8, Tom: 1.0 }, min: 0.8, mean: 0.9 };
  const runner: Scored = { entity: run, perMember: { Ana: 0.4, Tom: 1.0 }, min: 0.4, mean: 0.7 };
  const p = pick([winner, runner], [member("Ana"), member("Tom")]);
  assert.equal(p.fairness, "Everyone scores it at least 80%; the next best option leaves Ana at 40%.");
});
