import { pick, score } from "./consensus.js";
import { Qloo } from "./qloo.js";
import { QlooError, type Entity, type Kind, type Member, type Pick, type ResolvedMember } from "./types.js";

export const MAX_MEMBERS = 8;
export const MAX_LIKES = 5;

/** Resolve every like to a Qloo entity, in parallel. Unknown names are reported, never guessed. */
export async function resolveMembers(qloo: Qloo, members: Member[], kind: Kind): Promise<ResolvedMember[]> {
  return Promise.all(members.map(async (m) => {
    const likes = m.likes.map((l) => l.trim()).filter(Boolean).slice(0, MAX_LIKES);
    const found = await Promise.all(likes.map((l) => qloo.search(l, kind).catch(() => null)));
    const liked = found.filter((e): e is Entity => e !== null);
    return { name: m.name.trim().slice(0, 40) || "Someone", liked, unresolved: likes.filter((_, i) => found[i] === null) };
  }));
}

/** The whole agent step: resolve likes, ask Qloo for each person's affinities, then pick fairly. */
export async function findCommonGround(qloo: Qloo, members: Member[], kind: Kind, location?: string): Promise<{ pick: Pick; members: ResolvedMember[] }> {
  if (members.length < 2 || members.length > MAX_MEMBERS) throw new QlooError(400, `Add between 2 and ${MAX_MEMBERS} people.`);
  const resolved = await resolveMembers(qloo, members, kind);
  const empty = resolved.filter((m) => m.liked.length === 0).map((m) => m.name);
  if (empty.length) throw new QlooError(422, `We could not find anything ${empty.join(" and ")} listed. Check the spelling or add another favourite.`);
  const lists = await Promise.all(resolved.map((m) => qloo.insights(m.liked, kind, { take: 50, location })));
  const perMember = Object.fromEntries(resolved.map((m, i) => [m.name, lists[i] ?? []]));
  const scored = score(perMember);
  if (scored.length === 0) throw new QlooError(404, "Qloo returned no candidates for this group. Try another category or more favourites.");
  return { pick: pick(scored, resolved), members: resolved };
}
