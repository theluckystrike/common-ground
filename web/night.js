"use strict";

// Plan a night out. Friends list mixed favourites, Qloo picks dinner, drinks and live music in one city.

const NIGHT_EXAMPLES = [
  {
    label: "Friday in Lisbon",
    city: "Lisbon",
    friends: [
      { name: "Ana", likes: "Radiohead, Dune" },
      { name: "Tom", likes: "Kendrick Lamar, The Bear" },
      { name: "Priya", likes: "Phoebe Bridgers, Normal People" },
      { name: "Sam", likes: "Miles Davis, Fleabag" },
    ],
  },
  {
    label: "Birthday in New York",
    city: "New York",
    friends: [
      { name: "Maya", likes: "Beyonce, Succession" },
      { name: "Leo", likes: "Bon Iver, The Secret History" },
      { name: "Jo", likes: "Daft Punk, Interstellar" },
    ],
  },
  {
    label: "Team night in London",
    city: "London",
    friends: [
      { name: "Kasia", likes: "Arctic Monkeys, Peaky Blinders" },
      { name: "Marek", likes: "Little Simz, Fleabag" },
      { name: "Ewa", likes: "Adele, Pride and Prejudice" },
      { name: "Piotr", likes: "Jamie xx, Blade Runner 2049" },
    ],
  },
];

const MAX_FRIENDS = 6;
const MAX_LIKES = 4;
const COLORS = ["#c4633a", "#3f7d6e", "#6a5acd", "#a8742a", "#b23a6a", "#3a6fb2"];
// Suggested times only. We do not check dates, opening hours or availability.
const STOP_TIME = { dinner: "8 pm", drinks: "10 pm", music: "11 pm" };
const KIND = { artist: "music", movie: "film", tv_show: "TV", book: "book" };

const night = { city: "", friends: [] };

function $(id) { return document.getElementById(id); }

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function pct(x) { return Math.round((x || 0) * 100); }

function renderExamples() {
  const box = $("night-examples");
  box.replaceChildren(make("span", "chips-label", "Try an example"));
  for (const ex of NIGHT_EXAMPLES) {
    const btn = make("button", "chip", ex.label);
    btn.type = "button";
    btn.addEventListener("click", () => applyExample(ex));
    box.append(btn);
  }
}

function applyExample(ex) {
  night.city = ex.city;
  night.friends = ex.friends.map((f) => ({ ...f }));
  $("night-city").value = ex.city;
  renderFriends();
  hide();
}

function renderFriends() {
  const list = $("night-friends");
  list.replaceChildren();
  night.friends.forEach((f, i) => {
    const row = make("div", "night-row");
    const name = make("input", "text-input");
    name.placeholder = "Name";
    name.maxLength = 40;
    name.value = f.name;
    name.setAttribute("aria-label", `Friend ${i + 1} name`);
    name.addEventListener("input", () => { f.name = name.value; hide(); });
    const likes = make("input", "text-input");
    likes.placeholder = "Radiohead, Dune, The Bear";
    likes.maxLength = 330;
    likes.value = f.likes;
    likes.setAttribute("aria-label", `Friend ${i + 1} favourites`);
    likes.addEventListener("input", () => { f.likes = likes.value; hide(); });
    const remove = make("button", "remove-like", "Remove");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove friend ${i + 1}`);
    remove.addEventListener("click", () => { night.friends.splice(i, 1); renderFriends(); hide(); });
    row.append(name, likes, remove);
    list.append(row);
  });
  $("night-add").hidden = night.friends.length >= MAX_FRIENDS;
}

function hide() {
  $("night-result").hidden = true;
  $("night-error").hidden = true;
}

function showError(message) {
  const box = $("night-error");
  box.textContent = message;
  box.hidden = false;
}

function payload() {
  const members = night.friends.map((f) => ({
    name: f.name.trim(),
    likes: f.likes.split(",").map((s) => s.trim()).filter(Boolean),
  }));
  const errors = [];
  if (!night.city.trim()) errors.push("Add a city.");
  if (members.length < 2) errors.push("Add at least 2 friends.");
  if (new Set(members.map((m) => m.name.toLowerCase())).size !== members.length) errors.push("Give each friend a different name.");
  members.forEach((m, i) => {
    const label = m.name || `Friend ${i + 1}`;
    if (!m.name) errors.push(`Add a name for friend ${i + 1}.`);
    if (m.likes.length < 1) errors.push(`${label} needs at least 1 favourite.`);
    if (m.likes.length > MAX_LIKES) errors.push(`${label} can list at most ${MAX_LIKES} favourites.`);
  });
  return { errors, body: { city: night.city.trim(), members } };
}

async function plan() {
  const { errors, body } = payload();
  if (errors.length) { showError(errors.join(" ")); return; }
  hide();
  const btn = $("night-btn");
  btn.disabled = true;
  btn.textContent = "Asking Qloo about every friend (about 10 s)...";
  try {
    const res = await fetch("/api/night", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data && data.error ? data.error : "Something went wrong. Please try again.");
    render(data);
  } catch (err) {
    showError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Plan our night";
  }
}

export function render(data) {
  const box = $("night-result");
  box.replaceChildren();
  const names = data.members.map((m) => m.name);
  const color = (n) => COLORS[names.indexOf(n) % COLORS.length];
  box.append(make("h2", "result-heading", `Your night in ${data.city}`));
  const schedule = make("p", "schedule-note", "The times below are suggestions only. We do not check dates, opening hours or availability, so check each venue before you go.");
  schedule.setAttribute("role", "note");
  box.append(schedule);
  const missing = Array.isArray(data.missingStops) ? data.missingStops : [];
  if (missing.length) {
    const notice = make("p", "plan-incomplete", `This plan is incomplete. Qloo could not find ${missing.map((s) => (s.label || s).toLowerCase()).join(" or ")} for this group. The stops below are still useful.`);
    notice.setAttribute("role", "status");
    box.append(notice);
  }
  // Explainability shows when one friend's favourites barely shape the plan. Say so, and say how to fix it.
  const quiet = names.filter((n) => data.stops.reduce((a, s) => a + (s.influence[n] || 0), 0) / data.stops.length < 0.6 / names.length);
  if (quiet.length) box.append(make("p", "fairness", `${quiet.join(" and ")} ${quiet.length > 1 ? "shape" : "shapes"} this plan least. Qloo links their favourites less to places here. Add another band or film for ${quiet.join(" and ")} to give them more say.`));
  const stops = make("div", "stops");
  for (const s of data.stops) stops.append(renderStop(s, names, color));
  box.append(stops);
  const t = data.trace;
  const work = make("details", "qloo-work");
  work.open = true;
  work.append(make("summary", "section-label", "Show Qloo's work"));
  work.append(make("p", "trace-line",
    `${t.searches + t.insights} live Qloo calls in ${(t.ms / 1000).toFixed(1)} s. ${t.searches} searches matched the favourites. ${t.insights} Insights calls. Per stop, one group call with explainability and one call per friend.` +
    (data.cached ? " This plan was made in the last 30 minutes and is shown again without new calls." : "")));
  const matched = make("ul", "matched-list");
  for (const m of data.members) {
    const li = make("li", "matched-item");
    li.append(make("span", "unresolved-name", m.name));
    const found = m.liked.map((e) => `${e.name} (${KIND[e.kind] || e.kind})`).join(", ");
    const missing = m.unresolved.length ? `. Not found: ${m.unresolved.join(", ")}` : "";
    li.append(document.createTextNode(`Qloo matched ${found || "nothing"}${missing}`));
    matched.append(li);
  }
  work.append(make("h4", "work-label", "Favourites matched to Qloo entities"), matched);
  work.append(make("p", "step-caption", "Scores are raw Qloo affinity from 0 to 100 for each friend. Each stop is the venue whose lowest score is highest. \"Picked by\" comes from Qloo's explainability feature, which says how much each favourite drove the recommendation."));
  box.append(work);
  box.hidden = false;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderStop(s, names, color) {
  const card = make("article", "stop-card");
  const e = s.winner.entity;
  card.append(make("span", "stop-time", `Suggested ${STOP_TIME[s.key] || ""} · ${s.label}`));
  card.append(make("h3", "stop-name", e.name));
  if (e.address) card.append(make("p", "stop-meta", e.address));
  const next = s.alternatives[0];
  const gap = next ? pct(s.winner.min) - pct(next.min) : null;
  const close = gap !== null && gap <= 1 ? ` Close call. ${next.entity.name} scores within 1 point.` : "";
  card.append(make("p", "stop-min", `Lowest Qloo taste affinity ${pct(s.winner.min)} out of 100.${close}`));
  card.append(make("p", "because-label", "Picked by"));
  const because = make("ul", "because");
  // Qloo explainability is often near-uniform. Then the honest reading is a balanced compromise, not one cause.
  const weights = s.because.map((b) => b.weight);
  const flat = weights.length > 1 && Math.max(...weights) - Math.min(...weights) < 0.03;
  for (const b of s.because) because.append(make("li", "", `${b.name} (${b.friends.join(", ")}, ${KIND[b.kind] || b.kind})${flat ? "" : ` ${pct(b.weight)}%`}`));
  if (!s.because.length) because.append(make("li", "", "the group's shared taste"));
  card.append(because);
  if (flat) card.append(make("p", "stop-meta", "Qloo weighs these favourites about equally, so this venue is a balanced compromise."));
  card.append(make("p", "because-label", "Whose taste counts"));
  // Near-equal shares carry no information, so say that in words instead of drawing four equal bars.
  const even = names.every((n) => Math.abs((s.influence[n] || 0) - 1 / names.length) < 0.05);
  if (even) {
    card.append(make("p", "stop-meta", "Everyone's taste counts about equally here."));
  } else {
    const bar = make("div", "influence");
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", names.map((n) => `${n} ${pct(s.influence[n])}%`).join(", "));
    const legend = make("p", "influence-legend");
    for (const n of names) {
      const part = make("span");
      part.style.width = `${pct(s.influence[n])}%`;
      part.style.background = color(n);
      bar.append(part);
      const item = make("span");
      const dot = make("i");
      dot.style.background = color(n);
      item.append(dot, document.createTextNode(`${n} ${pct(s.influence[n])}%`));
      legend.append(item);
    }
    card.append(bar, legend);
  }
  card.append(make("p", "stop-scores", "Qloo affinity " + names.map((n) => `${n} ${pct(s.winner.perMember[n])}`).join(", ")));
  if (s.alternatives.length) card.append(make("p", "stop-alt", "Also close " + s.alternatives.map((a) => `${a.entity.name} (${pct(a.min)})`).join(", ")));
  return card;
}

function init() {
  renderExamples();
  applyExample(NIGHT_EXAMPLES[0]);
  $("night-city").addEventListener("input", (ev) => { night.city = ev.target.value; hide(); });
  $("night-add").addEventListener("click", () => {
    if (night.friends.length >= MAX_FRIENDS) return;
    night.friends.push({ name: "", likes: "" });
    renderFriends();
  });
  $("night-btn").addEventListener("click", plan);
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);
