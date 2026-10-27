import { McpServer } from "@modelcontextprotocol/server";

import { findCommonGround } from "./group.js";
import { groupInput, nightInput } from "./input.js";
import { NIGHT_NOTE, planNight } from "./night.js";
import { dataSource } from "./runtime.js";
import { QlooError } from "./types.js";

export function createServer(apiKey: string | undefined): McpServer {
  const server = new McpServer({ name: "common-ground", version: "1.0.0" });
  server.registerTool("find_common_ground", {
    title: "Find common ground for a group",
    description: "Pick ONE movie, TV show, book, music artist, podcast, restaurant (kind=place, with location) or destination that a whole group will enjoy. Give each person's name and 2 to 5 things they love. Favourites can come from another category with tasteFrom, for example music artists to pick a restaurant, or any for a mix of artists, movies, TV shows and books. Uses Qloo's taste graph to score every candidate for every person and returns the option that makes the least happy person as happy as possible, with a reason per person.",
    inputSchema: groupInput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ kind, location, members, tasteFrom }) => {
    const { qloo, mode, note } = dataSource(apiKey);
    if (mode === "demo" && kind === "place" && location?.toLowerCase() !== "warsaw") {
      return { content: [{ type: "text" as const, text: "Demo restaurants are fictional and limited to Warsaw." }], isError: true };
    }
    try {
      const { pick, members: resolved, trace } = await findCommonGround(qloo, members, kind, location, tasteFrom);
      const reasons = Object.values(pick.why).join(" ");
      const text = `${note} Pick ${pick.winner.entity.name}. ${pick.fairness} ${reasons}`;
      return { content: [{ type: "text" as const, text }], structuredContent: { pick, members: resolved, trace, mode, note } };
    } catch (err) {
      const message = err instanceof QlooError ? err.message : "Something went wrong while asking Qloo. Please try again.";
      return { content: [{ type: "text" as const, text: message }], isError: true };
    }
  });
  server.registerTool("plan_night_out", {
    title: "Plan a night out for a group of friends",
    description: "Plan dinner, drinks and a live music venue in one city for 2 to 6 friends. Give the city and each friend's name with 1 to 4 music artists, movies, TV shows or books they love. Qloo's cross-domain taste graph turns that shared taste into real venues. Each stop is the venue whose least happy friend is happiest, and Qloo explainability names the favourites behind it, with the share of each friend's taste.",
    inputSchema: nightInput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ city, members }) => {
    const { qloo, mode, note } = dataSource(apiKey);
    if (mode === "demo") return { content: [{ type: "text" as const, text: "Night plans need live Qloo data, and this server has no Qloo key." }], isError: true };
    try {
      const plan = await planNight(qloo, members, city);
      const lines = plan.stops.map((s) => `${s.label}: ${s.winner.entity.name}${s.winner.entity.address ? ` (${s.winner.entity.address})` : ""}. Everyone scores it at least ${Math.round(s.winner.min * 100)}%. Because of ${s.because.map((b) => `${b.name} (${b.friends.join(", ")})`).join(", ") || "the group's shared taste"}.`);
      return { content: [{ type: "text" as const, text: `${NIGHT_NOTE} Night out in ${city}.\n${lines.join("\n")}` }], structuredContent: { ...plan, mode, note: NIGHT_NOTE } };
    } catch (err) {
      const message = err instanceof QlooError ? err.message : "Something went wrong while asking Qloo. Please try again.";
      return { content: [{ type: "text" as const, text: message }], isError: true };
    }
  });
  return server;
}
