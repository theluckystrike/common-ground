// Never reads or prints credentials. A successful POST proves Qloo responded.
const base = process.argv[2];
if (!base) throw new Error("Pass the deployed HTTPS URL.");
const health = await fetch(new URL("/health", base), { signal: AbortSignal.timeout(15_000) });
const state = await health.json();
if (!health.ok || state.mode !== "live" || !state.keyConfigured) throw new Error("Live mode is not configured.");
const res = await fetch(new URL("/api/pick", base), {
  method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(30_000),
  body: JSON.stringify({ kind: "movie", members: [
    { name: "Ana", likes: ["Prisoners", "Gone Girl"] },
    { name: "Tom", likes: ["Interstellar", "Inception"] },
  ] }),
});
const result = await res.json();
if (!res.ok) throw new Error(`Live pick failed with HTTP ${res.status}. ${result.error ?? ""}`);
if (result.mode !== "live" || !result.pick?.winner?.entity?.id || result.members?.some((m) => !m.liked?.length)) {
  throw new Error("A live recommendation was not verified.");
}
console.log("Live mode verified. Qloo entity searches and per-person insights returned a group pick.");
