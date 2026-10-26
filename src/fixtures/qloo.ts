/**
 * Hand-authored synthetic fixtures. These are not captured Qloo data.
 * Search envelope and query parameter follow the published 200 response schema.
 * https://docs.qloo.com/reference/get-search
 * Insights envelope follows the published 200 response schema.
 * https://docs.qloo.com/reference/insights-api-deep-dive
 * Entity query.affinity is a 0 to 1 score. Scores here are invented for replay.
 * https://docs.qloo.com/reference/glossary
 * No live entity IDs, response data, venue facts or API credentials are stored.
 */
import type { Kind } from "../types.js";

type Entry = { name: string; id: string; entity_type: string; tags: { name: string }[] };
type Catalogue = { seeds: Entry[]; candidates: Entry[] };
const titles: Record<Kind, [string[], string[]]> = {
  movie: [
    ["Prisoners", "Gone Girl", "The Silence of the Lambs", "Interstellar", "Inception", "Dune", "Parasite", "Little Women", "Spirited Away", "The Grand Budapest Hotel", "Moonrise Kingdom", "Paddington"],
    ["Arrival", "The Truman Show", "Hunt for the Wilderpeople", "Knives Out", "The Iron Giant"],
  ],
  book: [
    ["The Secret History", "Normal People", "Circe", "The Road", "Station Eleven", "Klara and the Sun", "Pachinko", "Homegoing", "The Overstory"],
    ["Piranesi", "A Gentleman in Moscow", "The Night Circus", "Cloud Atlas", "The Remains of the Day"],
  ],
  place: [
    ["Polka", "Zapiecek", "Uki Uki", "Vegan Ramen Shop", "Regina Bar", "Charlotte", "Alewino", "Bibenda"],
    ["Demo Garden Table", "Demo Corner Kitchen", "Demo Market Cafe", "Demo Green Bowl", "Demo Supper Club"],
  ],
  artist: [["Radiohead", "Bjork", "Beyonce", "Kendrick Lamar", "Taylor Swift", "Bon Iver"], ["Little Simz", "Sault", "Khruangbin", "Jungle", "Arlo Parks"]],
  tv_show: [["Severance", "Dark", "The Bear", "Ted Lasso", "Succession", "Fleabag"], ["Station Eleven", "Reservation Dogs", "The Good Place", "Slow Horses", "Detectorists"]],
  podcast: [["Radiolab", "99% Invisible", "Planet Money", "Hidden Brain"], ["Demo Listening Room", "Demo Curious Minds", "Demo Long View", "Demo Field Notes", "Demo Shared Stories"]],
  destination: [["Paris", "Tokyo", "Lisbon", "Kyoto"], ["Demo Riverside", "Demo Old Town", "Demo Hill Country", "Demo Coast", "Demo City Break"]],
  video_game: [["Portal", "Stardew Valley", "Hades", "Celeste"], ["Demo Co-op Quest", "Demo Puzzle Garden", "Demo Shared World", "Demo New Journey", "Demo Campfire"]],
};

function entries(names: string[], kind: Kind, offset: number): Entry[] {
  const type = kind === "video_game" ? "videogame" : kind;
  return names.map((name, i) => ({
    id: `00000000-0000-4000-8000-${String(Object.keys(titles).indexOf(kind) * 1000 + offset + i).padStart(12, "0")}`,
    name, entity_type: `urn:entity:${type}`, tags: [],
  }));
}

export const catalogues = Object.fromEntries(Object.entries(titles).map(([kind, [seeds, candidates]]) => [
  kind, { seeds: entries(seeds, kind as Kind, 1), candidates: entries(candidates, kind as Kind, 501) },
])) as Record<Kind, Catalogue>;

// Each row is one synthetic taste profile. Column zero is a compromise.
const affinities = [
  [0.82, 1, 0.61, 0.42, 0.3],
  [0.86, 0.4, 1, 0.56, 0.2],
  [0.79, 0.6, 0.41, 1, 0.25],
  [0.84, 0.55, 0.64, 0.36, 1],
];

export const fixtureFetch: typeof fetch = async (input) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const type = url.searchParams.get("types") ?? url.searchParams.get("filter.type");
  const kind = type?.replace("urn:entity:", "").replace("videogame", "video_game") as Kind;
  const catalogue = catalogues[kind];
  if (!catalogue) return Response.json({ code: 400, reason: "Bad Request", message: "Unknown demo category." }, { status: 400 });
  if (url.pathname === "/search") {
    const query = url.searchParams.get("query")?.toLowerCase();
    const results = [...catalogue.seeds, ...catalogue.candidates].filter((e) => e.name.toLowerCase() === query);
    return Response.json({ success: true, duration: 0, results });
  }
  if (url.pathname === "/v2/insights") {
    const ids = url.searchParams.get("signal.interests.entities")?.split(",") ?? [];
    const first = catalogue.seeds.findIndex((e) => ids.includes(e.id));
    const row = affinities[Math.floor(Math.max(0, first) / 3) % affinities.length]!;
    const entities = catalogue.candidates.map((e, i) => ({ ...e, query: { affinity: row[i]! } }));
    return Response.json({ success: true, results: { entities, duration: 0 } });
  }
  return Response.json({ code: 404, reason: "Not Found", message: "No demo fixture for this endpoint." }, { status: 404 });
};
