import { fixtureFetch } from "./fixtures/qloo.js";
import { Qloo } from "./qloo.js";

export function dataSource(apiKey?: string) {
  const live = Boolean(apiKey?.trim());
  return {
    qloo: live ? new Qloo(apiKey!) : new Qloo("", fixtureFetch),
    mode: live ? "live" as const : "demo" as const,
    note: live
      ? "Live Qloo responses. Night plans show raw Qloo affinity per friend. Single picks scale each person's scores to their own best match."
      : "Demo mode. Replayed synthetic fixtures. No live Qloo calls. Scores are invented. Restaurant fixtures are for Warsaw only. Use the example groups or listed demo favourites.",
  };
}
