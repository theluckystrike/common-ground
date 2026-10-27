import { pick, score } from "./consensus.js";
import { Qloo } from "./qloo.js";
import { QlooError, type Entity, type Kind, type Member, type Pick, type ResolvedMember, type Trace } from "./types.js";

export const MAX_MEMBERS = 8;
export const MAX_LIKES = 5;

/** Resolve every like to a Qloo entity, in parallel. Unknown names are reported, never guessed. */
export async function resolveMembers(qloo: Qloo, members: Member[], kind: Kind): Promise<ResolvedMember[]> {
  return Promise.all(members.map(async (m) => {
    const likes = m.likes.map((l) => l.trim()).filter(Boolean).slice(0, MAX_LIKES);
    const found = await Promise.all(likes.map((l) => qloo.search(l, kind)));
    const liked = found.filter((e): e is Entity => e !== null);
    return { name: m.name.trim().slice(0, 40) || "Someone", liked, unresolved: likes.filter((_, i) => found[i] === null) };
  }));
}

/**
 * The whole agent step: resolve likes, ask Qloo for each person's affinities, then pick fairly.
 * `tasteFrom` lets favourites come from another domain, so music taste can pick a film or a restaurant.
 */
export async function findCommonGround(qloo: Qloo, members: Member[], kind: Kind, location?: string, tasteFrom: Kind = kind): Promise<{ pick: Pick; members: ResolvedMember[]; trace: Trace }> {
  if (members.length < 2 || members.length > MAX_MEMBERS) throw new QlooError(400, `Add between 2 and ${MAX_MEMBERS} people.`);
  const started = Date.now();
  const before = { ...qloo.calls };
  const resolved = await resolveMembers(qloo, members, tasteFrom);
  const empty = resolved.filter((m) => m.liked.length === 0).map((m) => m.name);
  if (empty.length) throw new QlooError(422, `We could not find anything ${empty.join(" and ")} listed. Check the spelling or add another favourite.`);
  const lists = await Promise.all(resolved.map((m) => qloo.insights(m.liked, kind, { take: 50, location })));
  // Top-50 lists rarely overlap, so ask Qloo how each person rates the shared pool of everyone's top picks.
  const favourites = new Set(resolved.flatMap((m) => m.liked.map((e) => e.id)));
  const share = Math.ceil(50 / resolved.length);
  const pool = [...new Set(lists.flatMap((l) => l.filter((c) => !favourites.has(c.entity.id)).slice(0, share).map((c) => c.entity.id)))].slice(0, 50);
  if (pool.length > 0) {
    const extra = await Promise.all(resolved.map((m) => qloo.insights(m.liked, kind, { take: pool.length, location, candidates: pool })));
    extra.forEach((more, i) => {
      const have = new Set(lists[i]!.map((c) => c.entity.id));
      lists[i]!.push(...more.filter((c) => !have.has(c.entity.id)));
    });
  }
  const perMember = Object.fromEntries(resolved.map((m, i) => [m.name, lists[i] ?? []]));
  const scored = score(perMember);
  if (scored.length === 0) throw new QlooError(404, "Qloo returned no candidates for this group. Try another category or more favourites.");
  if (scored.every((s) => resolved.some((m) => m.liked.some((e) => e.id === s.entity.id)))) {
    throw new QlooError(404, "No new candidates remain. Try more favourites or another category.");
  }
  const trace: Trace = { tasteFrom, target: kind, searches: qloo.calls.search - before.search,
    insights: qloo.calls.insights - before.insights, pool: pool.length, ms: Date.now() - started };
  return { pick: pick(scored, resolved, tasteFrom !== kind), members: resolved, trace };
}
