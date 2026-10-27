import * as z from "zod/v4";

export const KINDS = ["movie", "tv_show", "book", "artist", "podcast", "place", "destination", "video_game"] as const;

export const groupInput = z.object({
  kind: z.enum(KINDS),
  tasteFrom: z.enum([...KINDS, "any"]).optional().describe("Category of the favourites, when it differs from kind. Example artist, to pick a movie from music. Use any when favourites mix music artists, movies, TV shows and books."),
  location: z.string().trim().min(1).max(80).optional(),
  members: z.array(z.object({
    name: z.string().trim().min(1).max(40),
    likes: z.array(z.string().trim().min(1).max(80)).min(2).max(5),
  }).strict()).min(2).max(8),
}).strict().superRefine((group, ctx) => {
  const names = group.members.map((m) => m.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    ctx.addIssue({ code: "custom", message: "Give each person a different name." });
  }
  if (group.tasteFrom === "place") {
    ctx.addIssue({ code: "custom", message: "Restaurant favourites need a city, so use another taste category." });
  }
  if (group.kind === "place" && !group.location) {
    ctx.addIssue({ code: "custom", message: "Add a city for the restaurant." });
  }
});

export const nightInput = z.object({
  city: z.string().trim().min(1).max(80).describe("City for the night out, for example Lisbon or New York."),
  members: z.array(z.object({
    name: z.string().trim().min(1).max(40),
    likes: z.array(z.string().trim().min(1).max(80)).min(1).max(4)
      .describe("1 to 4 music artists, movies, TV shows or books this friend loves. Mix them freely."),
  }).strict()).min(2).max(6),
}).strict().superRefine((group, ctx) => {
  const names = group.members.map((m) => m.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    ctx.addIssue({ code: "custom", message: "Give each friend a different name." });
  }
});
