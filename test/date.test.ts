import { test } from "node:test";
import assert from "node:assert/strict";

import { nightDateScope, parseNightDate } from "../src/date.js";
import { QlooError } from "../src/types.js";

function invalid(value: string): void {
  assert.throws(
    () => parseNightDate(value),
    (err: unknown) => err instanceof QlooError && err.status === 400,
    `${value} should be rejected`,
  );
}

test("parseNightDate accepts real dates, including leap days", () => {
  assert.deepEqual(parseNightDate("2024-02-29"), { date: "2024-02-29", weekday: "thursday" });
  assert.deepEqual(parseNightDate("2000-02-29"), { date: "2000-02-29", weekday: "tuesday" });
  assert.deepEqual(parseNightDate("2026-10-30"), { date: "2026-10-30", weekday: "friday" });
});

test("parseNightDate rejects malformed and impossible calendar dates", () => {
  for (const value of [
    "2023-02-29", "1900-02-29", "2026-02-30", "2026-04-31", "2026-13-01",
    "2026-00-10", "2026-10-00", "1899-12-31", "abcd-ef-gh", "2026-1-1", "2026-10-30T00:00:00Z",
  ]) invalid(value);
});

test("a Friday keeps its weekday when the host timezone changes", () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = "Pacific/Kiritimati";
    assert.equal(parseNightDate("2026-10-30").weekday, "friday");
    process.env.TZ = "America/Los_Angeles";
    assert.equal(parseNightDate("2026-10-30").weekday, "friday");
    process.env.TZ = "UTC";
    assert.equal(parseNightDate("2026-10-30").weekday, "friday");
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test("the date scope names the documented Qloo filter and its limits", () => {
  const scope = nightDateScope(parseNightDate("2026-10-30"));
  assert.equal(scope.requestedDate, "2026-10-30");
  assert.equal(scope.weekday, "friday");
  assert.deepEqual(scope.qlooFilter, { parameter: "filter.hours", value: "friday" });
  assert.equal(scope.openingDayFiltered, true);
  assert.match(scope.limits, /Exact opening hours/);
  assert.match(scope.limits, /holiday schedules/);
  assert.match(scope.limits, /not checked/);
  assert.doesNotMatch(scope.limits, /filter\.hours/);
});

test("without a date the scope says opening day was not filtered", () => {
  const scope = nightDateScope(null);
  assert.equal(scope.requestedDate, null);
  assert.equal(scope.weekday, null);
  assert.equal(scope.qlooFilter, null);
  assert.equal(scope.openingDayFiltered, false);
  assert.match(scope.limits, /not checked/);
  assert.doesNotMatch(scope.limits, /No date selected/);
  assert.doesNotMatch(scope.limits, /filter\.hours/);
});
