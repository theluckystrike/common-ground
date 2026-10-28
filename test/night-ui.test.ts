import { test } from "node:test";
import assert from "node:assert/strict";

import { render } from "../web/night.js";

class FakeNode {
  className = "";
  textContent = "";
  hidden = false;
  open = false;
  style: Record<string, string> = {};
  children: FakeNode[] = [];
  attrs: Record<string, string> = {};
  append(...nodes: FakeNode[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: FakeNode[]) { this.children = nodes; }
  setAttribute(key: string, value: string) { this.attrs[key] = value; }
  addEventListener() {}
  scrollIntoView() {}
}

const roots = new Map<string, FakeNode>();
(globalThis as unknown as { document: unknown }).document = {
  getElementById(id: string) {
    const node = roots.get(id) ?? new FakeNode();
    roots.set(id, node);
    return node;
  },
  createElement() { return new FakeNode(); },
  createTextNode(text: string) { const node = new FakeNode(); node.textContent = text; return node; },
};

function text(node: FakeNode): string {
  return node.textContent + node.children.map(text).join(" ");
}

function nodes(node: FakeNode): FakeNode[] {
  return [node, ...node.children.flatMap(nodes)];
}

function stop(key: string, label: string, name: string) {
  return {
    key, label,
    winner: { entity: { id: name, name, kind: "place", tags: [], address: "R. Nova do Carvalho 12" }, perMember: { Ana: 0.8, Tom: 0.7 }, min: 0.7, mean: 0.75 },
    alternatives: [],
    because: [{ name: "Radiohead", kind: "artist", friends: ["Ana"], weight: 1 }],
    influence: { Ana: 0.5, Tom: 0.5 },
  };
}

function plan(overrides: Record<string, unknown> = {}) {
  return {
    city: "Lisbon",
    stops: [stop("dinner", "Dinner", "Dinner Only"), stop("drinks", "Drinks", "Bar"), stop("music", "Live music", "Music Hall")],
    complete: true,
    missingStops: [],
    members: [{ name: "Ana", liked: [], unresolved: [] }, { name: "Tom", liked: [], unresolved: [] }],
    trace: { searches: 1, insights: 2, ms: 100 },
    ...overrides,
  };
}

test("night result labels times as suggestions and says opening hours are unverified", () => {
  const box = roots.get("night-result") ?? new FakeNode();
  roots.set("night-result", box);
  render(plan());
  const out = text(box);
  assert.match(out, /Suggested 8 pm · Dinner/);
  assert.match(out, /suggestions only/i);
  assert.match(out, /opening hours/i);
  assert.match(out, /availability/i);
  assert.match(out, /Lowest Qloo taste affinity 70 out of 100/);
  assert.match(out, /Qloo affinity Ana 80, Tom 70/);
  assert.doesNotMatch(out, /Everyone scores it/);
  assert.doesNotMatch(out, /incomplete/i);
  assert.ok(nodes(box).some((n) => n.className === "schedule-note" && n.attrs.role === "note"));
});

test("night result shows which requested stops are missing and keeps the found stops", () => {
  const box = roots.get("night-result") ?? new FakeNode();
  roots.set("night-result", box);
  render(plan({ stops: [stop("dinner", "Dinner", "Dinner Only")], complete: false, missingStops: [{ key: "drinks", label: "Drinks" }, { key: "music", label: "Live music" }] }));
  const out = text(box);
  assert.match(out, /plan is incomplete/i);
  assert.match(out, /could not find drinks or live music/i);
  assert.match(out, /still useful/i);
  assert.match(out, /Dinner Only/);
  assert.ok(nodes(box).some((n) => n.className === "plan-incomplete" && n.attrs.role === "status"));
});
