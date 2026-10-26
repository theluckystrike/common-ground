import type { Entity, Pick, ResolvedMember, Scored } from "./types";

type Candidate = { entity: Entity; affinity: number };

function normalise(list: Candidate[]): Map<string, number> {
  const byId = new Map<string, number>();
  for (const c of list) {
    const prev = byId.get(c.entity.id);
    if (prev === undefined || c.affinity > prev) byId.set(c.entity.id, c.affinity);
  }
  let max = 0;
  for (const aff of byId.values()) if (aff > max) max = aff;
  const out = new Map<string, number>();
  for (const [id, aff] of byId) out.set(id, max > 0 ? aff / max : 0);
  return out;
}

export function score(perMember: Record<string, Candidate[]>): Scored[] {
  const names = Object.keys(perMember).sort();
  const norm = new Map<string, Map<string, number>>();
  const entityById = new Map<string, Entity>();
  for (const name of names) {
    const n = normalise(perMember[name] ?? []);
    norm.set(name, n);
    for (const id of n.keys()) {
      if (!entityById.has(id)) {
        const found = (perMember[name] ?? []).find((c) => c.entity.id === id);
        if (found) entityById.set(id, found.entity);
      }
    }
  }
  const scored: Scored[] = [];
  for (const [id, entity] of entityById) {
    const per: Record<string, number> = Object.create(null);
    let sum = 0;
    for (const name of names) {
      const value = norm.get(name)?.get(id) ?? 0;
      per[name] = value;
      sum += value;
    }
    const min = Math.min(...Object.values(per));
    const mean = names.length > 0 ? sum / names.length : 0;
    scored.push({ entity, perMember: per, min, mean });
  }
  scored.sort((a, b) =>
    b.min - a.min ||
    b.mean - a.mean ||
    a.entity.name.localeCompare(b.entity.name) ||
    a.entity.id.localeCompare(b.entity.id)
  );
  return scored;
}

function sharedTags(a: Entity, b: Entity): string[] {
  return a.tags.filter((t) => b.tags.includes(t)).sort();
}

function explain(winner: Entity, member: ResolvedMember): string {
  let best: Entity | null = null;
  let bestShared: string[] = [];
  for (const liked of member.liked) {
    const shared = sharedTags(winner, liked);
    if (shared.length > bestShared.length) {
      best = liked;
      bestShared = shared;
    }
  }
  if (best !== null && bestShared.length > 0) {
    return `${member.name} likes ${bestShared.join(", ")} like ${best.name}, and this is one.`;
  }
  const strongest = member.liked[0];
  if (strongest) {
    return `Closest to ${member.name}'s love of ${strongest.name}.`;
  }
  return `${member.name}'s taste was matched by group agreement.`;
}

function fairness(winner: Scored, runnersUp: Scored[], members: ResolvedMember[]): string {
  const minPct = Math.round(winner.min * 100);
  const leastHappy = members.find((m) => winner.perMember[m.name] === winner.min);
  const name = leastHappy?.name ?? members[0]?.name ?? "the group";
  const head = `Everyone scores it at least ${minPct}%`;
  const next = runnersUp[0];
  if (!next) return `${head}.`;
  const nextPct = Math.round((next.perMember[name] ?? 0) * 100);
  return `${head}; the next best option leaves ${name} at ${nextPct}%.`;
}

export function pick(scored: Scored[], members: ResolvedMember[]): Pick {
  const likedIds = new Set<string>();
  for (const m of members) for (const e of m.liked) likedIds.add(e.id);
  const candidates = scored.filter((s) => !likedIds.has(s.entity.id));
  const winner = candidates[0];
  if (!winner) throw new Error("No candidates remain after removing already-liked items.");
  const runnersUp = candidates.slice(1, 4);
  const why: Record<string, string> = Object.create(null);
  for (const m of members) why[m.name] = explain(winner.entity, m);
  return { winner, runnersUp, why, fairness: fairness(winner, runnersUp, members) };
}
