"use strict";

const KIND_OPTIONS = [
  { value: "movie", label: "Movie", hint: "a film everyone will enjoy" },
  { value: "book", label: "Book", hint: "one read for the whole group" },
  { value: "place", label: "Restaurant", hint: "a place to eat together" },
  { value: "artist", label: "Music artist", hint: "an artist to put on" },
  { value: "tv_show", label: "TV show", hint: "a series to binge" },
];

const EXAMPLE_GROUPS = [
  {
    label: "Family movie night",
    kind: "movie",
    location: "",
    members: [
      { name: "Ana", likes: ["Prisoners", "Gone Girl", "The Silence of the Lambs"] },
      { name: "Tom", likes: ["Interstellar", "Inception", "Dune"] },
      { name: "Priya", likes: ["Parasite", "Little Women", "Spirited Away"] },
      { name: "Sam", likes: ["The Grand Budapest Hotel", "Moonrise Kingdom", "Paddington"] },
    ],
  },
  {
    label: "Team dinner in Warsaw",
    kind: "place",
    location: "Warsaw",
    members: [
      { name: "Kasia", likes: ["Polka", "Zapiecek", "Uki Uki"] },
      { name: "Marek", likes: ["Regina Bar", "Charlotte", "Alewino"] },
      { name: "Ewa", likes: ["Vegan Ramen Shop", "Bibenda", "Uki Uki"] },
      { name: "Piotr", likes: ["Polka", "Bibenda", "Regina Bar"] },
    ],
  },
  {
    label: "Shared playlist",
    kind: "artist",
    members: [
      { name: "Alex", likes: ["Radiohead", "Bjork"] },
      { name: "Jo", likes: ["Kendrick Lamar", "Taylor Swift"] },
    ],
  },
  {
    label: "TV night",
    kind: "tv_show",
    members: [
      { name: "Alex", likes: ["Severance", "Dark"] },
      { name: "Jo", likes: ["Ted Lasso", "Fleabag"] },
    ],
  },
  {
    label: "Book club",
    kind: "book",
    location: "",
    members: [
      { name: "Maya", likes: ["The Secret History", "Normal People", "Circe"] },
      { name: "Leo", likes: ["The Road", "Station Eleven", "Klara and the Sun"] },
      { name: "Noa", likes: ["Pachinko", "Homegoing", "The Overstory"] },
    ],
  },
];

const MIN_MEMBERS = 2;
const MAX_MEMBERS = 8;
const MIN_LIKES = 2;
const MAX_LIKES = 5;

const state = { kind: null, location: "", members: [] };

function el(id) {
  return document.getElementById(id);
}

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function kindName(kind) {
  const found = KIND_OPTIONS.find((o) => o.value === kind);
  if (found) return found.label;
  if (!kind) return "";
  return kind.charAt(0).toUpperCase() + kind.slice(1).replace(/_/g, " ");
}

function renderKinds() {
  const grid = el("kind-grid");
  grid.replaceChildren();
  for (const opt of KIND_OPTIONS) {
    const label = make("label", "kind-card");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "kind";
    radio.value = opt.value;
    radio.addEventListener("change", () => selectKind(opt.value));
    label.append(radio, make("span", "kind-name", opt.label), make("span", "kind-hint", opt.hint));
    grid.append(label);
  }
}

function selectKind(kind) {
  state.kind = kind;
  const radio = document.querySelector(`input[name="kind"][value="${kind}"]`);
  if (radio) radio.checked = true;
  renderLocation();
  onMembersChanged();
}

function renderLocation() {
  const field = el("location-field");
  const show = state.kind === "place";
  field.hidden = !show;
  if (show && !el("location-input").value) el("location-input").focus();
}

function renderExamples() {
  const box = el("example-chips");
  box.replaceChildren();
  box.append(make("span", "chips-label", "Try an example"));
  for (const group of EXAMPLE_GROUPS) {
    const btn = make("button", "chip", group.label);
    btn.type = "button";
    btn.addEventListener("click", () => applyExample(group));
    box.append(btn);
  }
}

function applyExample(group) {
  state.kind = group.kind;
  state.location = group.location || "";
  state.members = group.members.map((m) => ({ name: m.name, likes: m.likes.slice() }));
  const radio = document.querySelector(`input[name="kind"][value="${group.kind}"]`);
  if (radio) radio.checked = true;
  el("location-input").value = state.location;
  renderLocation();
  renderPeople();
  onMembersChanged();
}

function renderPeople() {
  const list = el("people-list");
  list.replaceChildren();
  state.members.forEach((member, i) => list.append(renderMemberCard(member, i)));
  updateAddPerson();
}

function renderMemberCard(member, i) {
  const card = make("article", "member-card");

  const header = make("div", "member-header");
  header.append(make("span", "member-index", String(i + 1)));
  const removeBtn = make("button", "remove-member", "Remove");
  removeBtn.type = "button";
  removeBtn.setAttribute("aria-label", `Remove person ${i + 1}`);
  removeBtn.addEventListener("click", () => {
    state.members.splice(i, 1);
    renderPeople();
    onMembersChanged();
  });
  header.append(removeBtn);
  card.append(header);

  const nameId = `m${i}-name`;
  const nameLabel = make("label", "field-label", "Name");
  nameLabel.htmlFor = nameId;
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.id = nameId;
  nameInput.className = "text-input";
  nameInput.placeholder = "Their name";
  nameInput.maxLength = 40;
  nameInput.autocomplete = "off";
  nameInput.value = member.name;
  nameInput.addEventListener("input", () => {
    member.name = nameInput.value;
    onMembersChanged();
  });
  card.append(nameLabel, nameInput);

  const likesLabel = make("label", "field-label", "Things they love");
  likesLabel.htmlFor = `m${i}-like0`;
  card.append(likesLabel);

  const likesBox = make("div", "likes");
  member.likes.forEach((like, j) => likesBox.append(renderLikeRow(member, i, j, like)));
  card.append(likesBox);

  if (member.likes.length < MAX_LIKES) {
    const addLikeBtn = make("button", "add-like", "Add another favourite");
    addLikeBtn.type = "button";
    addLikeBtn.addEventListener("click", () => {
      member.likes.push("");
      renderPeople();
      onMembersChanged();
    });
    card.append(addLikeBtn);
  }

  return card;
}

function renderLikeRow(member, i, j, value) {
  const row = make("div", "like-row");
  const input = document.createElement("input");
  input.type = "text";
  input.id = `m${i}-like${j}`;
  input.className = "text-input like-input";
  input.placeholder = "A thing they love";
  input.maxLength = 80;
  input.autocomplete = "off";
  input.value = value;
  input.addEventListener("input", () => {
    member.likes[j] = input.value;
    hideResult();
  });
  const removeBtn = make("button", "remove-like", "Remove");
  removeBtn.type = "button";
  removeBtn.setAttribute("aria-label", `Remove favourite ${j + 1} for person ${i + 1}`);
  removeBtn.addEventListener("click", () => {
    member.likes.splice(j, 1);
    renderPeople();
    onMembersChanged();
  });
  row.append(input, removeBtn);
  return row;
}

function addMember() {
  if (state.members.length >= MAX_MEMBERS) return;
  state.members.push({ name: "", likes: ["", ""] });
  renderPeople();
  onMembersChanged();
}

function updateAddPerson() {
  const btn = el("add-person");
  if (btn) btn.hidden = state.members.length >= MAX_MEMBERS;
}

function updateStepVisibility() {
  el("step-people").hidden = !state.kind;
  el("step-submit").hidden = !state.kind || state.members.length < MIN_MEMBERS;
  updateAddPerson();
}

function onMembersChanged() {
  hideResult();
  renderSubmitSummary();
  updateStepVisibility();
}

function renderSubmitSummary() {
  const box = el("submit-summary");
  if (!box) return;
  const n = state.members.length;
  if (state.kind === "place") {
    const city = state.location.trim();
    box.textContent = city ? `A restaurant in ${city} for ${n} people.` : `A restaurant for ${n} people.`;
    return;
  }
  box.textContent = `A ${kindName(state.kind).toLowerCase()} for ${n} people.`;
}

function collectMembers() {
  return state.members.map((m) => ({
    name: m.name.trim(),
    likes: m.likes.map((l) => l.trim()).filter(Boolean),
  }));
}

function validate() {
  const errors = [];
  if (!state.kind) {
    errors.push("Choose what to pick first.");
    return { errors, members: [] };
  }
  const members = collectMembers();
  if (new Set(members.map((m) => m.name.toLowerCase())).size !== members.length) errors.push("Give each person a different name.");
  if (members.length < MIN_MEMBERS) errors.push(`Add at least ${MIN_MEMBERS} people.`);
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const label = m.name || `Person ${i + 1}`;
    if (!m.name) errors.push(`Add a name for ${label}.`);
    if (m.likes.length < MIN_LIKES) errors.push(`${label} needs at least ${MIN_LIKES} favourites.`);
    if (m.likes.length > MAX_LIKES) errors.push(`${label} can list at most ${MAX_LIKES} favourites.`);
  }
  if (state.kind === "place" && !state.location.trim()) {
    errors.push("Add a city for the restaurant.");
  }
  return { errors, members };
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function fallbackMessage(res) {
  if (res.status === 503) return "The demo has no Qloo API key configured yet.";
  if (res.status >= 500) return "Something went wrong on our side. Please try again.";
  return "Something went wrong. Please try again.";
}

async function findCommonGround() {
  const { errors, members } = validate();
  if (errors.length) {
    showError(errors.join(" "));
    return;
  }
  hideError();
  const btn = el("find-btn");
  btn.disabled = true;
  btn.textContent = "Finding your common ground...";
  hideResult();
  const payload = { kind: state.kind, members };
  if (state.kind === "place") payload.location = state.location.trim();
  try {
    const res = await fetch("/api/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await readJson(res);
    if (!res.ok) {
      const message = data && typeof data.error === "string" && data.error ? data.error : fallbackMessage(res);
      throw new Error(message);
    }
    renderResult(data);
  } catch (err) {
    showError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Find our common ground";
  }
}

function showError(message) {
  const box = el("error-box");
  box.textContent = message;
  box.hidden = false;
}

function hideError() {
  const box = el("error-box");
  box.textContent = "";
  box.hidden = true;
}

function hideResult() {
  const box = el("result");
  box.hidden = true;
  box.replaceChildren();
}

function renderResult(data) {
  const pick = data && data.pick ? data.pick : null;
  const members = Array.isArray(data && data.members) ? data.members : [];
  const box = el("result");
  box.replaceChildren();
  if (!pick || !pick.winner || !pick.winner.entity) {
    box.hidden = true;
    return;
  }
  box.append(make("h2", "result-heading", "Your common ground"));
  box.append(make("p", "mode-banner", data.note));
  box.append(make("p", "step-caption", "Relative match scores within each person’s candidate list. These are not probabilities of enjoyment."));
  box.append(renderWinner(pick.winner));
  if (pick.fairness) box.append(make("p", "fairness", pick.fairness));
  box.append(renderScores(pick.winner, pick.why, members));
  if (Array.isArray(pick.runnersUp) && pick.runnersUp.length) box.append(renderRunnersUp(pick.runnersUp));
  box.append(renderUnresolved(members));
  box.hidden = false;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderWinner(scored) {
  const entity = scored.entity || {};
  const card = make("article", "winner-card");
  if (entity.image) {
    const img = document.createElement("img");
    img.className = "winner-image";
    img.src = entity.image;
    img.alt = entity.name || "";
    img.loading = "lazy";
    card.append(img);
  }
  const body = make("div", "winner-body");
  body.append(make("span", "winner-kind", kindName(entity.kind)));
  body.append(make("h3", "winner-name", entity.name || "Your pick"));
  const meta = [];
  if (entity.year) meta.push(String(entity.year));
  if (entity.address) meta.push(entity.address);
  if (meta.length) body.append(make("p", "winner-meta", meta.join(" \u00b7 ")));
  card.append(body);
  return card;
}

function renderScores(scored, why, members) {
  const section = make("section", "scores");
  section.append(make("h3", "section-label", "How it lands for each person"));
  const perMember = scored.perMember || {};
  const names = members.map((m) => m.name);
  for (const name of Object.keys(perMember)) {
    if (!names.includes(name)) names.push(name);
  }
  const list = make("ol", "score-list");
  for (const name of names) {
    const raw = typeof perMember[name] === "number" ? perMember[name] : 0;
    const pct = clamp(Math.round(raw * 100), 0, 100);
    const reason = typeof why[name] === "string" ? why[name] : "";
    list.append(renderScoreRow(name, pct, reason));
  }
  section.append(list);
  return section;
}

function renderScoreRow(name, pct, reason) {
  const li = make("li", "score-row");
  const top = make("div", "score-top");
  top.append(make("span", "score-name", name));
  const bar = make("div", "score-bar");
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  bar.setAttribute("aria-valuenow", String(pct));
  bar.setAttribute("aria-label", `${name} match score`);
  const fill = make("div", "score-fill");
  fill.style.width = `${pct}%`;
  bar.append(fill);
  top.append(make("span", "score-num", String(pct)));
  li.append(top, bar);
  if (reason) li.append(make("p", "score-why", reason));
  return li;
}

function renderRunnersUp(list) {
  const section = make("section", "runners");
  section.append(make("h3", "section-label", "Also in the running"));
  const grid = make("div", "runners-grid");
  for (const scored of list) {
    const entity = scored.entity || {};
    const card = make("article", "runner-card");
    card.append(make("span", "runner-kind", kindName(entity.kind)));
    card.append(make("h4", "runner-name", entity.name || ""));
    const meta = [];
    if (entity.year) meta.push(String(entity.year));
    if (entity.address) meta.push(entity.address);
    if (meta.length) card.append(make("p", "runner-meta", meta.join(" \u00b7 ")));
    const min = clamp(Math.round((scored.min || 0) * 100), 0, 100);
    card.append(make("p", "runner-min", `Everyone scores it at least ${min}%`));
    grid.append(card);
  }
  section.append(grid);
  return section;
}

function renderUnresolved(members) {
  const section = make("section", "unresolved");
  const items = [];
  for (const m of members) {
    const missing = Array.isArray(m.unresolved) ? m.unresolved.filter((s) => s) : [];
    if (missing.length) items.push({ name: m.name, missing });
  }
  if (!items.length) return section;
  section.append(make("h3", "section-label", "A few we could not find"));
  const list = make("ul", "unresolved-list");
  for (const item of items) {
    const li = make("li", "unresolved-item");
    li.append(make("span", "unresolved-name", item.name));
    li.append(document.createTextNode(`We could not find ${item.missing.join(", ")}`));
    list.append(li);
  }
  section.append(list);
  return section;
}

function init() {
  renderKinds();
  renderExamples();
  applyExample(EXAMPLE_GROUPS[0]);
  fetch("/health").then((res) => {
    if (!res.ok) throw new Error("Health check failed.");
    return res.json();
  }).then((data) => {
    el("mode-banner").textContent = data.mode === "demo" ? data.note : "Live mode is configured. A successful pick confirms a Qloo response.";
  }).catch(() => { el("mode-banner").textContent = "Could not check the data source. Each result will show its mode."; });
  renderPeople();
  updateStepVisibility();
  renderSubmitSummary();
  el("find-btn").addEventListener("click", findCommonGround);
  el("add-person").addEventListener("click", addMember);
  el("location-input").addEventListener("input", (e) => {
    state.location = e.target.value;
    renderSubmitSummary();
  });
}

document.addEventListener("DOMContentLoaded", init);
