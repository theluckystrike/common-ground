# Common Ground: specification (Qloo Agentic Hackathon)

A group (family, friends, team, book club) needs ONE movie, book, restaurant, artist or TV show that everyone will enjoy.
Each person names 2 to 5 things they love. Common Ground uses Qloo's taste graph to score candidates for every person,
then picks the option that makes the least happy person as happy as possible (maximin), not the average. It explains
the pick person by person. It is an agentic tool: an MCP server (`find_common_ground`) that any agent can call, plus a web app.

Why Qloo is essential: an LLM alone can only guess what five different people will all like; Qloo measures each
person's affinity to each candidate from real taste data, so the fairness math has real numbers to work with.

Runtime: Cloudflare Workers, TypeScript ESM. Qloo hackathon base URL: `https://hackathon.api.qloo.com` (key in header
`X-Api-Key`, from env QLOO_API_KEY; never logged). Node 24 toolchain; tests never hit the network (fake fetch).
Tests: `PATH=$HOME/paybox-hackathon-2026-10-17/.node/node-v24.21.0-darwin-arm64/bin:$PATH npx tsx --test test/<file>.test.ts`.
Qloo docs are saved in docs/*.txt (insights-api-deep-dive.txt, parameter-overview.txt, entity-type-parameter-guide.txt,
qloo-llm-hackathon-developer-guide.txt). Read them; use only documented parameters. Do not call the real API (no key yet).

## Shared contract (src/types.ts, orchestrator owns it)

```ts
export type Kind = "movie" | "tv_show" | "book" | "artist" | "podcast" | "place" | "destination" | "video_game";
export interface Entity { id: string; name: string; kind: Kind; tags: string[]; year?: number; image?: string; url?: string; address?: string }
export interface Member { name: string; likes: string[] }            // raw names as typed by the person
export interface ResolvedMember { name: string; liked: Entity[]; unresolved: string[] }
export interface Scored { entity: Entity; perMember: Record<string, number>; min: number; mean: number }  // scores 0..1
export interface Pick { winner: Scored; runnersUp: Scored[]; why: Record<string, string>; fairness: string }
export class QlooError extends Error { constructor(public status: number, message: string) { super(message); } }
```

## Modules and owners

| File | Owner | Exports |
|---|---|---|
| src/qloo.ts + test/qloo.test.ts | W1 | `class Qloo { constructor(key, fetchFn?, base?); search(name: string, kind: Kind): Promise<Entity|null>; insights(liked: Entity[], kind: Kind, opts: {take: number, location?: string}): Promise<Array<{entity: Entity, affinity: number}>> }` |
| src/consensus.ts + test/consensus.test.ts | W2 | `score(perMember: Record<string, Array<{entity, affinity}>>): Scored[]`; `pick(scored: Scored[], members: ResolvedMember[]): Pick` |
| web/index.html, web/app.js, web/styles.css | W3 | the web app |
| src/types.ts, src/server.ts (MCP), src/worker.ts | orchestrator | |

### Qloo client (W1)
- Entity types: `urn:entity:<kind>` (place = restaurants/bars/cafes; use filter.location.query when given).
- search: the documented search endpoint (read the docs to find its path and parameters; it is listed under "Entity Data APIs"/"Search");
  return the best match of the requested type, mapped to Entity (tags: tag names, max 12). Null when nothing matches.
- insights: GET `/v2/insights` with `filter.type`, `signal.interests.entities` (comma-separated entity ids), `take` (max 50),
  and for place `filter.location.query`. Map each result entity to {entity, affinity}; affinity from the result's documented
  affinity/score field (read the docs: the score sits in the result's `query` object). Normalise affinity to 0..1 if the docs say otherwise.
- Timeouts 5 s; non-2xx -> QlooError(status, message); 401/403 message says to check the hackathon base URL and key.
- Tests: build fixtures that follow the documented response examples exactly; cover empty results, missing affinity, 401, 429, timeout.

### Consensus (W2)
- Input: per member, the list of candidates with affinity from that member's own insights call.
- Per member, rank-normalise affinities to 0..1 (best = 1). A candidate missing from a member's list scores 0 for them.
- Remove candidates that any member already listed as a like (they know it already).
- Scored.min = lowest member score, mean = average. Sort by min desc, then mean desc, then name.
- pick: winner = first; runnersUp = next 3; why[name] = one plain sentence per member built from tag overlap between the winner
  and that member's liked entities ("Ana likes slow-burn thrillers like Prisoners, and this is one."); if no overlap, use the
  member's strongest liked entity ("Closest to Tom's love of Interstellar."). fairness = one sentence: "Everyone scores it at least
  <min as percent>; the next best option leaves <name of least happy> at <percent>."
- Tests: 2, 3 and 6 members; a candidate loved by 4 and hated by 1 must lose to one everyone likes; ties; empty lists; duplicates.

### Web app (W3)
Calm, warm, social design (think a well-made dinner-party app). Step 1: choose what to pick (Movie, Book, Restaurant + city, Music artist,
TV show). Step 2: add people (name + up to 5 likes each, 2 to 8 people), with example group chips ("Family movie night", "Team dinner in
Warsaw", "Book club"). Step 3: "Find our common ground" -> POST /api/pick {kind, location?, members} -> result: big winner card (name, year,
image if any), a bar per person showing their score (0-100), the per-person "why" sentence, the fairness sentence, 3 runners-up.
Unresolved likes shown in amber ("We could not find: X"). Errors inline in plain words. No frameworks, no external assets, no emojis,
textContent only (never innerHTML with server text), accessible, works at 375 px and 1280 px.
Footer: "Common Ground by Michael Lip, github.com/theluckystrike. Taste data: Qloo."

## Hard rules
No secrets in code or logs. Functions under 60 lines. No while(true). No empty catch. Edit only your files. Plain English. No emojis.
