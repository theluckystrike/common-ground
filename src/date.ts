import { QlooError } from "./types.js";

/** Qloo's documented filter.hours values are lowercase day names. */
export const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface NightDate {
  date: string;
  weekday: Weekday;
}

/** What the date did and did not filter. Returned to the web UI and MCP callers. */
export interface NightDateScope {
  requestedDate: string | null;
  weekday: Weekday | null;
  qlooFilter: { parameter: "filter.hours"; value: Weekday } | null;
  openingDayFiltered: boolean;
  limits: string;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LIMITS = "Exact opening hours, holiday schedules, live availability, travel feasibility and event tickets are not checked.";

/**
 * Validate a real YYYY-MM-DD calendar date and derive its weekday in UTC.
 * UTC keeps the weekday identical on every host timezone; local Date parsing can shift a date by a day.
 */
export function parseNightDate(value: string): NightDate {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new QlooError(400, "Use a date in YYYY-MM-DD form.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 9999) throw new QlooError(400, "Use a year between 1900 and 9999.");
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    throw new QlooError(400, `${value} is not a real calendar date.`);
  }
  return { date: value, weekday: WEEKDAYS[utc.getUTCDay()]! };
}

export function nightDateScope(selected: NightDate | null): NightDateScope {
  if (!selected) {
    return {
      requestedDate: null,
      weekday: null,
      qlooFilter: null,
      openingDayFiltered: false,
      limits: LIMITS,
    };
  }
  return {
    requestedDate: selected.date,
    weekday: selected.weekday,
    qlooFilter: { parameter: "filter.hours", value: selected.weekday },
    openingDayFiltered: true,
    limits: LIMITS,
  };
}
