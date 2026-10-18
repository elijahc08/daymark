import assert from "node:assert/strict";
import test from "node:test";
import { occurrencesForRange } from "./recurrence";

test("a daily task produces an occurrence for each day in the loaded all-tasks range", () => {
  const task = {
    id: "daily-task",
    title: "Morning routine",
    scheduledDate: "2026-10-17",
    startTime: "07:00",
    endTime: "07:30",
    durationMinutes: 30,
    completed: false,
    goalId: null,
    recurrence: { frequency: "daily" as const, interval: 1, weekdays: [], endDate: null, count: null },
    routineGroupId: null,
    routineName: null,
    createdAt: "2026-10-17T00:00:00.000Z",
    updatedAt: "2026-10-17T00:00:00.000Z",
  };

  const occurrences = occurrencesForRange(task, [], "2026-10-17", "2026-10-30", "Europe/London");
  assert.equal(occurrences.length, 14);
  assert.equal(occurrences[0].occurrenceDate, "2026-10-17");
  assert.equal(occurrences.at(-1)?.occurrenceDate, "2026-10-30");
});
