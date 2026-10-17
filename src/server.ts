import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { findCommonGround, MAX_LIKES, MAX_MEMBERS } from "./group.js";
import { Qloo } from "./qloo.js";
import { QlooError } from "./types.js";

const KINDS = ["movie", "tv_show", "book", "artist", "podcast", "place", "destination", "video_game"] as const;

export function createServer(apiKey: string | undefined): McpServer {
  const server = new McpServer({ name: "common-ground", version: "1.0.0" });
  server.registerTool("find_common_ground", {
    title: "Find common ground for a group",
    description: "Pick ONE movie, TV show, book, music artist, podcast, restaurant (kind=place, with location) or destination that a whole group will enjoy. Give each person's name and 2 to 5 things they love. Uses Qloo's taste graph to score every candidate for every person and returns the option that makes the least happy person as happy as possible, with a reason per person.",
    inputSchema: z.object({
      kind: z.enum(KINDS),
      location: z.string().trim().max(80).optional().describe("City or area, for kind=place, for example \"Warsaw\"."),
      members: z.array(z.object({ name: z.string().trim().min(1).max(40), likes: z.array(z.string().trim().min(1).max(80)).min(1).max(MAX_LIKES) }).strict()).min(2).max(MAX_MEMBERS),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ kind, location, members }) => {
    if (!apiKey) return { content: [{ type: "text" as const, text: "This server has no Qloo API key configured." }], isError: true };
    try {
      const { pick, members: resolved } = await findCommonGround(new Qloo(apiKey), members, kind, location);
      const reasons = Object.entries(pick.why).map(([n, w]) => `${n}: ${w}`).join(" ");
      const text = `Pick ${pick.winner.entity.name}. ${pick.fairness} ${reasons}`;
      return { content: [{ type: "text" as const, text }], structuredContent: { pick, members: resolved } };
    } catch (err) {
      const message = err instanceof QlooError ? err.message : "Something went wrong while asking Qloo. Please try again.";
      return { content: [{ type: "text" as const, text: message }], isError: true };
    }
  });
  return server;
}
