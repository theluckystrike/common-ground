import { McpServer } from "@modelcontextprotocol/server";

import { findCommonGround } from "./group.js";
import { groupInput } from "./input.js";
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
  return server;
}
