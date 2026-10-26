import * as z from "zod/v4";

export const KINDS = ["movie", "tv_show", "book", "artist", "podcast", "place", "destination", "video_game"] as const;

export const groupInput = z.object({
  kind: z.enum(KINDS),
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
  if (group.kind === "place" && !group.location) {
    ctx.addIssue({ code: "custom", message: "Add a city for the restaurant." });
  }
});
