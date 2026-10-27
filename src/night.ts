import { resolveMembers } from "./group.js";
import { Qloo } from "./qloo.js";
import { QlooError, type Entity, type Member, type ResolvedMember, type Scored } from "./types.js";

/** The three stops of a night out. Each is a Qloo place genre tag in the chosen city. */
export const STOPS = [
  { key: "dinner", label: "Dinner", tag: "urn:tag:genre:place:restaurant" },
  { key: "drinks", label: "Drinks", tag: "urn:tag:category:place:bar" },
  { key: "music", label: "Live music", tag: "urn:tag:genre:place:live_music_venue" },
] as const;

export const NIGHT_MAX_FRIENDS = 6;
export const NIGHT_MAX_LIKES = 4;
const GROUP_TAKE = 25;
export const NIGHT_NOTE = "Live Qloo responses. Scores are raw Qloo affinity for each friend, from 0 to 100.";
const SHOWN_REASONS = 3;

/** One favourite that Qloo says drove a pick, and whose favourite it is. */
export interface Because { name: string; kind: Entity["kind"]; friends: string[]; weight: number }
export interface Stop {
  key: (typeof STOPS)[number]["key"];
  label: string;
  winner: Scored;
  alternatives: Scored[];
  /** Top favourites behind the pick, from Qloo's explainability scores. */
  because: Because[];
  /** Share of the pick that each friend's favourites explain, 0 to 1. */
  influence: Record<string, number>;
}
export interface NightTrace { searches: number; insights: number; ms: number }
export interface NightPlan { city: string; stops: Stop[]; members: ResolvedMember[]; trace: NightTrace }

type Candidate = { entity: Entity; affinity: number; explain?: Array<{ id: string; score: number }> };

/** Turn Qloo's per-input explainability for one pick into named favourites and a share per friend. */
export function explainPick(explain: Array<{ id: string; score: number }>, members: ResolvedMember[]): { because: Because[]; influence: Record<string, number> } {
  const owners = new Map<string, { entity: Entity; friends: string[] }>();
  for (const m of members) {
    for (const e of m.liked) {
      const o = owners.get(e.id) ?? { entity: e, friends: [] };
      if (!o.friends.includes(m.name)) o.friends.push(m.name);
      owners.set(e.id, o);
    }
  }
  const known = explain.filter((x) => owners.has(x.id) && x.score > 0);
  const total = known.reduce((s, x) => s + x.score, 0);
  const influence: Record<string, number> = Object.create(null);
  for (const m of members) influence[m.name] = 0;
  for (const x of known) {
    const o = owners.get(x.id)!;
    // A favourite two friends share counts for both of them, split evenly.
    for (const f of o.friends) influence[f] = (influence[f] ?? 0) + (total > 0 ? x.score / total / o.friends.length : 0);
  }
  const because = [...known].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, SHOWN_REASONS).map((x) => {
    const o = owners.get(x.id)!;
    return { name: o.entity.name, kind: o.entity.kind, friends: o.friends, weight: total > 0 ? x.score / total : 0 };
  });
  return { because, influence };
}

/**
 * Rank venues by each friend's raw Qloo affinity (0 to 1), not scaled to their own best match.
 * Scaling made every finalist look like 95 to 100. Raw affinity keeps real gaps visible.
 * A venue Qloo left out of one friend's scores counts as 0 for them, which keeps the pick fair.
 */
export function rankRaw(perMember: Record<string, Candidate[]>, pool: string[]): Scored[] {
  const names = Object.keys(perMember);
  const byName = new Map(names.map((n) => [n, new Map((perMember[n] ?? []).map((c) => [c.entity.id, c]))]));
  const out: Scored[] = [];
  for (const id of pool) {
    let entity: Entity | undefined;
    const per: Record<string, number> = Object.create(null);
    for (const n of names) {
      const c = byName.get(n)!.get(id);
      if (c && !entity) entity = c.entity;
      per[n] = c ? c.affinity : 0;
    }
    if (!entity) continue;
    const values = Object.values(per);
    out.push({ entity, perMember: per, min: Math.min(...values), mean: values.reduce((a, b) => a + b, 0) / (values.length || 1) });
  }
  return out.sort((a, b) => b.min - a.min || b.mean - a.mean || a.entity.name.localeCompare(b.entity.name));
}

/** Choose a different venue for each stop, in stop order, by the fairest score. */
export function chooseStops(ranked: Scored[][]): Array<{ winner: Scored; alternatives: Scored[] } | null> {
  const used = new Set<string>();
  return ranked.map((list) => {
    const free = list.filter((s) => !used.has(s.entity.id));
    const winner = free[0];
    if (!winner) return null;
    used.add(winner.entity.id);
    return { winner, alternatives: free.slice(1, 3) };
  });
}

/**
 * Plan a night out for friends from their taste in music, films, TV and books.
 * For each stop, one Qloo Insights call with everyone's favourites and explainability builds the
 * candidate pool, then one call per friend scores that pool. The stop goes to the venue whose least
 * happy friend is happiest, and Qloo's explainability names the favourites behind it.
 */
export async function planNight(qloo: Qloo, members: Member[], city: string): Promise<NightPlan> {
  if (members.length < 2 || members.length > NIGHT_MAX_FRIENDS) throw new QlooError(400, `Add between 2 and ${NIGHT_MAX_FRIENDS} friends.`);
  const started = Date.now();
  const before = { ...qloo.calls };
  const capped = members.map((m) => ({ ...m, likes: m.likes.slice(0, NIGHT_MAX_LIKES) }));
  const resolved = await resolveMembers(qloo, capped, "any");
  const empty = resolved.filter((m) => m.liked.length === 0).map((m) => m.name);
  if (empty.length) throw new QlooError(422, `We could not find anything ${empty.join(" and ")} listed. Check the spelling or add another favourite.`);
  const everyone = [...new Map(resolved.flatMap((m) => m.liked).map((e) => [e.id, e])).values()];

  const perStop = await Promise.all(STOPS.map(async (stop) => {
    const group: Candidate[] = await qloo.insights(everyone, "place", { take: GROUP_TAKE, location: city, tag: stop.tag, explain: true });
    const pool = group.map((c) => c.entity.id);
    if (pool.length === 0) return { ranked: [] as Scored[], group };
    const lists = await Promise.all(resolved.map((m) => qloo.insights(m.liked, "place", { take: pool.length, location: city, candidates: pool, tag: stop.tag })));
    return { ranked: rankRaw(Object.fromEntries(resolved.map((m, i) => [m.name, lists[i] ?? []])), pool), group };
  }));

  const chosen = chooseStops(perStop.map((p) => p.ranked));
  const stops: Stop[] = [];
  chosen.forEach((c, i) => {
    if (!c) return;
    const explain = perStop[i]!.group.find((g) => g.entity.id === c.winner.entity.id)?.explain ?? [];
    stops.push({ key: STOPS[i]!.key, label: STOPS[i]!.label, ...c, ...explainPick(explain, resolved) });
  });
  if (stops.length === 0) throw new QlooError(404, `Qloo found no restaurants, bars or music venues for this group in ${city}. Try a bigger city.`);
  const trace: NightTrace = { searches: qloo.calls.search - before.search, insights: qloo.calls.insights - before.insights, ms: Date.now() - started };
  return { city, stops, members: resolved, trace };
}
