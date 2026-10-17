// Shared contract for Common Ground. Owned by the orchestrator; workers import, never edit.
export type Kind = "movie" | "tv_show" | "book" | "artist" | "podcast" | "place" | "destination" | "video_game";

export interface Entity { id: string; name: string; kind: Kind; tags: string[]; year?: number; image?: string; url?: string; address?: string }
export interface Member { name: string; likes: string[] }
export interface ResolvedMember { name: string; liked: Entity[]; unresolved: string[] }
export interface Scored { entity: Entity; perMember: Record<string, number>; min: number; mean: number }
export interface Pick { winner: Scored; runnersUp: Scored[]; why: Record<string, string>; fairness: string }

export class QlooError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "QlooError"; }
}
