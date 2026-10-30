export function render(data: unknown): void;
export interface NightExample {
  label: string;
  city: string;
  friends: Array<{ name: string; likes: string }>;
}
export const NIGHT_EXAMPLES: NightExample[];
export function applyExample(ex: NightExample): void;
export function plan(): Promise<void>;
