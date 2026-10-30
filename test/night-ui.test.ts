import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { applyExample, NIGHT_EXAMPLES, plan as submitPlan, render } from "../web/night.js";

class FakeNode {
  className = "";
  textContent = "";
  hidden = false;
  open = false;
  value = "";
  focused = false;
  validity: { badInput: boolean; valid: boolean } = { badInput: false, valid: true };
  style: Record<string, string> = {};
  children: FakeNode[] = [];
  attrs: Record<string, string> = {};
  append(...nodes: FakeNode[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: FakeNode[]) { this.children = nodes; }
  setAttribute(key: string, value: string) { this.attrs[key] = value; }
  removeAttribute(key: string) { delete this.attrs[key]; }
  focus() { this.focused = true; }
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

const HANDLER_IDS = ["night-result", "night-error", "night-btn", "night-city", "night-date", "night-friends", "night-add", "night-examples"];

function resetDom() {
  roots.clear();
  for (const id of HANDLER_IDS) roots.set(id, new FakeNode());
  applyExample(NIGHT_EXAMPLES[0]!);
  return { date: roots.get("night-date")!, error: roots.get("night-error")! };
}

type FetchCall = { url: string; body: Record<string, unknown> };

function watchFetch(calls: FetchCall[]): typeof fetch {
  return (async (input: unknown, init?: { body?: string }) => {
    calls.push({ url: String(input), body: JSON.parse(init?.body ?? "{}") as Record<string, unknown> });
    return { ok: true, json: async () => plan() } as unknown as Response;
  }) as typeof fetch;
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

test("night result shows the selected date and explains the Qloo weekday filter", () => {
  const box = roots.get("night-result") ?? new FakeNode();
  roots.set("night-result", box);
  render(plan({
    dateScope: {
      requestedDate: "2026-10-30",
      weekday: "friday",
      qlooFilter: { parameter: "filter.hours", value: "friday" },
      openingDayFiltered: true,
      limits: "Exact opening hours, holiday schedules, live availability, travel feasibility and event tickets are not checked.",
    },
  }));
  const out = text(box);
  assert.match(out, /Selected date 2026-10-30 \(friday\)/);
  assert.match(out, /day of the week only/);
  assert.match(out, /suggestions only/i);
  assert.match(out, /Exact opening hours/);
  assert.match(out, /holiday schedules/i);
  assert.match(out, /live availability/i);
  assert.match(out, /travel and event tickets/i);
  assert.match(out, /Suggested 8 pm · Dinner/);
  assert.doesNotMatch(out, /filter\.hours/);
  assert.doesNotMatch(out, /We do not check dates/);
  assert.equal(nodes(box).filter((n) => n.className === "schedule-note").length, 1);
});

test("night result with no date does not pretend a weekday was chosen", () => {
  const box = roots.get("night-result") ?? new FakeNode();
  roots.set("night-result", box);
  render(plan());
  const out = text(box);
  assert.match(out, /No date selected, so Qloo did not filter by opening day/);
  assert.doesNotMatch(out, /Selected date/);
  assert.doesNotMatch(out, /friday/i);
});

test("the example label does not claim a Friday when no date is selected", () => {
  const source = readFileSync(new URL("../web/night.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /label: "Friday in Lisbon"/);
  assert.match(source, /label: "Night in Lisbon"/);
});

test("the real Plan handler blocks a partial native date with zero fetch, sends a valid date, and allows a genuine blank", async () => {
  const original = globalThis.fetch;
  try {
    const calls: FetchCall[] = [];
    let dom = resetDom();
    dom.date.value = "";
    dom.date.validity = { badInput: true, valid: false };
    globalThis.fetch = watchFetch(calls);
    await submitPlan();
    assert.equal(calls.length, 0, "a partial date must not send a request");
    assert.match(dom.error.textContent, /incomplete or not a real date/i);
    assert.equal(dom.date.attrs["aria-invalid"], "true");
    assert.equal(dom.date.focused, true);

    calls.length = 0;
    dom = resetDom();
    dom.date.value = "2026-10-30";
    dom.date.validity = { badInput: false, valid: true };
    globalThis.fetch = watchFetch(calls);
    await submitPlan();
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.body.date, "2026-10-30");
    assert.equal(dom.date.attrs["aria-invalid"], undefined);

    calls.length = 0;
    dom = resetDom();
    dom.date.value = "";
    dom.date.validity = { badInput: false, valid: true };
    globalThis.fetch = watchFetch(calls);
    await submitPlan();
    assert.equal(calls.length, 1);
    assert.equal("date" in calls[0]!.body, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("the native date field and the handler both limit years to 1900 through 9999", async () => {
  const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  assert.match(html, /id="night-date"[^>]*min="1900-01-01"/);
  assert.match(html, /id="night-date"[^>]*max="9999-12-31"/);

  const original = globalThis.fetch;
  try {
    const calls: FetchCall[] = [];
    const dom = resetDom();
    dom.date.value = "1899-12-31";
    globalThis.fetch = watchFetch(calls);
    await submitPlan();
    assert.equal(calls.length, 0);
    assert.match(dom.error.textContent, /between 1900 and 9999/);
    assert.equal(dom.date.attrs["aria-invalid"], "true");
  } finally {
    globalThis.fetch = original;
  }
});
