import { QlooError, type Entity, type Kind, type TasteFrom } from "./types.js";

const DEFAULT_BASE = "https://hackathon.api.qloo.com";
const TIMEOUT_MS = 5_000;
const MAX_TAGS = 12;
const MAX_TAKE = 50;
const DEFAULT_TAKE = 20;
// The hackathon key allows 10 requests per second. Space calls to stay under it.
const GAP_MS = 125;
const RETRY_429_MS = 1_000;
const RETRIES_429 = 2;
// Without a genre tag, place results include museums and train stations.
const RESTAURANT_TAG = "urn:tag:genre:place:restaurant";

const KIND_TYPE: Record<Kind, string> = {
  movie: "urn:entity:movie",
  tv_show: "urn:entity:tv_show",
  book: "urn:entity:book",
  artist: "urn:entity:artist",
  podcast: "urn:entity:podcast",
  place: "urn:entity:place",
  destination: "urn:entity:destination",
  video_game: "urn:entity:videogame",
};

// "any" favourites are searched across these types and keep the type Qloo returns.
const ANY_KINDS: Kind[] = ["artist", "movie", "tv_show", "book"];
const TYPE_KIND = new Map(Object.entries(KIND_TYPE).map(([k, v]) => [v, k as Kind]));

function rawType(raw: unknown): string | undefined {
  const o = asRecord(raw);
  if (!o) return undefined;
  const type = o["entity_type"] ?? o["type"] ?? o["kind"] ?? (Array.isArray(o["types"]) ? o["types"][0] : undefined);
  return typeof type === "string" ? type : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function entitiesFrom(data: unknown): unknown[] {
  const root = asRecord(data);
  if (!root) return [];
  const results = root["results"];
  if (Array.isArray(results)) return results;
  const entities = asRecord(results)?.["entities"];
  if (Array.isArray(entities)) return entities;
  const top = root["entities"];
  return Array.isArray(top) ? top : [];
}

function tagName(tag: unknown): string {
  const o = asRecord(tag);
  const text = o ? (o["name"] ?? o["tag"] ?? o["id"]) : tag;
  const s = typeof text === "string" ? text : "";
  const i = s.lastIndexOf(":");
  return i >= 0 ? s.slice(i + 1) : s;
}

function tagNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const tag of value) {
    const name = tagName(tag);
    if (name && !out.includes(name)) out.push(name);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

function toEntity(raw: unknown, kind: Kind): Entity | null {
  const o = asRecord(raw);
  if (!o) return null;
  const id = asString(o["id"]) ?? asString(o["entity_id"]) ?? "";
  const name = asString(o["name"]) ?? "";
  if (!id && !name) return null;
  const entity: Entity = { id: id || name, name: name || id, kind, tags: tagNames(o["tags"]) };
  const props = asRecord(o["properties"]);
  const rawImage = o["image"] ?? props?.["image"];
  const image = asString(rawImage) ?? asString(asRecord(rawImage)?.["url"]);
  if (image) entity.image = image;
  const year = asNumber(o["year"])
    ?? (props ? asNumber(props["release_year"]) ?? asNumber(props["publication_year"]) ?? asNumber(props["year"]) : undefined);
  if (year !== undefined) entity.year = year;
  const url = asString(o["url"]) ?? (props ? asString(props["url"]) : undefined);
  if (url) entity.url = url;
  const address = asString(o["address"]) ?? (props ? asString(props["address"]) : undefined);
  if (address) entity.address = address;
  return entity;
}

function affinityOf(raw: unknown): number | undefined {
  const root = asRecord(raw);
  const query = root ? asRecord(root["query"]) : null;
  if (!query) return undefined;
  const number = asNumber(query["affinity"]) ?? asNumber(query["score"]);
  if (number !== undefined) return number;
  const text = query["affinity"];
  const parsed = typeof text === "string" ? Number(text) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normaliseAffinity(value: number | undefined): number {
  if (value === undefined) return 0;
  return Math.max(0, Math.min(1, value));
}

function matchesType(raw: unknown, kind: Kind): boolean {
  if (!asRecord(raw)) return false;
  const type = rawType(raw);
  if (type === undefined) return true;
  const got = type.replace("urn:entity:", "").replace(/_/g, "");
  return got === kind.replace(/_/g, "");
}

function clampTake(take: number): number {
  const n = Number.isFinite(take) ? Math.floor(take) : DEFAULT_TAKE;
  return Math.min(MAX_TAKE, Math.max(1, n));
}

function abortToError(err: unknown): QlooError {
  if (err instanceof Error && err.name === "AbortError") {
    return new QlooError(504, "Qloo did not answer within 5 seconds. Try again.");
  }
  return new QlooError(502, "Could not reach Qloo. Check your connection and the hackathon base URL.");
}

async function httpError(response: Response): Promise<QlooError> {
  const status = response.status;
  if (status === 401 || status === 403) {
    return new QlooError(status, "Qloo rejected the request. Check the hackathon base URL (https://hackathon.api.qloo.com) and your QLOO_API_KEY.");
  }
  if (status === 429) {
    return new QlooError(status, "Qloo is limiting how fast we can ask. Wait a moment and try again.");
  }
  return new QlooError(status, `Qloo returned an error with status ${status}. Try again later.`);
}

export class Qloo {
  constructor(
    private readonly key: string,
    // Workers throw "Illegal invocation" when global fetch is called as a method, so wrap it.
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
    private readonly base: string = DEFAULT_BASE,
  ) {}

  private nextSlot = 0;
  /** Count of Qloo calls by endpoint, shown to users so they can see the work behind a pick. */
  readonly calls = { search: 0, insights: 0 };

  /** Reserve the next send time so one group request never bursts past the per-second limit. */
  private async pace(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + GAP_MS;
    if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
  }

  async search(name: string, kind: TasteFrom): Promise<Entity | null> {
    const url = new URL("/search", this.base);
    url.searchParams.set("types", kind === "any" ? ANY_KINDS.map((k) => KIND_TYPE[k]).join(",") : KIND_TYPE[kind]);
    url.searchParams.set("query", name);
    this.calls.search++;
    let data: unknown;
    try { data = await this.get(url); } catch (err) {
      if (err instanceof QlooError && err.status === 404) return null;
      throw err;
    }
    for (const raw of entitiesFrom(data)) {
      const found = kind === "any" ? TYPE_KIND.get(rawType(raw) ?? "") : kind;
      if (!found || (kind === "any" && !ANY_KINDS.includes(found)) || !matchesType(raw, found)) continue;
      const entity = toEntity(raw, found);
      if (entity) return entity;
    }
    return null;
  }

  async insights(liked: Entity[], kind: Kind, opts: { take: number; location?: string; candidates?: string[] }): Promise<Array<{ entity: Entity; affinity: number }>> {
    const url = new URL("/v2/insights", this.base);
    url.searchParams.set("filter.type", KIND_TYPE[kind]);
    const ids = liked.map((e) => e.id).filter(Boolean);
    if (ids.length > 0) url.searchParams.set("signal.interests.entities", ids.join(","));
    url.searchParams.set("take", String(clampTake(opts.take)));
    if (opts.candidates?.length) url.searchParams.set("filter.results.entities", opts.candidates.join(","));
    if (kind === "place") {
      url.searchParams.set("filter.tags", RESTAURANT_TAG);
      if (opts.location) url.searchParams.set("filter.location.query", opts.location);
    }
    this.calls.insights++;
    const data = await this.get(url);
    const out: Array<{ entity: Entity; affinity: number }> = [];
    for (const raw of entitiesFrom(data)) {
      const entity = toEntity(raw, kind);
      if (!entity) continue;
      out.push({ entity, affinity: normaliseAffinity(affinityOf(raw)) });
    }
    return out;
  }

  private async get(url: URL): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.getOnce(url); } catch (err) {
        if (!(err instanceof QlooError) || err.status !== 429 || attempt >= RETRIES_429) throw err;
        await new Promise((r) => setTimeout(r, RETRY_429_MS));
      }
    }
  }

  private async getOnce(url: URL): Promise<unknown> {
    await this.pace();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await this.fetchFn(url.toString(), {
        method: "GET",
        headers: { "X-Api-Key": this.key, Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      throw abortToError(err);
    }
    clearTimeout(timer);
    if (!response.ok) throw await httpError(response);
    return await response.json().catch(() => ({}));
  }
}
