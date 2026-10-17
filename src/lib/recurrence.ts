import { Temporal } from "@js-temporal/polyfill";
import { RRuleTemporal } from "rrule-temporal";
import type { RepeatRule } from "@/src/db/schema";

const weekdayCodes = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export function occurrencesForRange(
  task: {
    id: string;
    title: string;
    scheduledDate: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    completed: boolean;
    goalId: string | null;
    recurrence: RepeatRule | null;
  },
  exceptions: Array<{
    originalDate: string;
    title: string | null;
    skipped: boolean;
    completed: boolean;
    movedDate: string | null;
    startTime: string | null;
    endTime: string | null;
    durationMinutes: number | null;
  }>,
  fromDate: string,
  throughDate: string,
  timeZone: string,
) {
  const exceptionsByDate = new Map(exceptions.map((exception) => [exception.originalDate, exception]));
  const output: Array<{
    id: string;
    seriesId: string;
    originalDate: string;
    occurrenceDate: string;
    title: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    completed: boolean;
    goalId: string | null;
    repeating: boolean;
  }> = [];

  const startDate = Temporal.PlainDate.from(task.scheduledDate);
  const startClock = Temporal.PlainTime.from(task.startTime);
  const dtstart = startDate.toZonedDateTime({ timeZone, plainTime: startClock });
  let dates: string[];

  if (!task.recurrence) {
    dates = task.scheduledDate >= fromDate && task.scheduledDate <= throughDate ? [task.scheduledDate] : [];
  } else {
    const rule = task.recurrence;
    const frequency = rule.frequency === "daily" || rule.frequency === "every-n-days" ? "DAILY" : "WEEKLY";
    const until = rule.endDate
      ? Temporal.ZonedDateTime.from(`${rule.endDate}T23:59:59[${timeZone}]`)
      : undefined;
    const recurrence = new RRuleTemporal({
      freq: frequency,
      interval: rule.frequency === "every-n-days" ? rule.interval : rule.frequency === "weekly" ? rule.interval : 1,
      byDay: rule.frequency === "weekdays" ? rule.weekdays.map((day) => weekdayCodes[day]) : undefined,
      count: rule.count ?? undefined,
      until,
      tzid: timeZone,
      dtstart,
      includeDtstart: true,
    });
    const from = Temporal.ZonedDateTime.from(`${fromDate}T00:00:00[${timeZone}]`);
    const through = Temporal.ZonedDateTime.from(`${throughDate}T23:59:59.999999999[${timeZone}]`);
    dates = recurrence.between(from, through, true).map((date) => date.toPlainDate().toString());
  }

  const candidates = new Set(dates);
  for (const exception of exceptions) {
    if (exception.movedDate && exception.movedDate >= fromDate && exception.movedDate <= throughDate) {
      candidates.add(exception.originalDate);
    }
  }

  for (const originalDate of candidates) {
    const exception = exceptionsByDate.get(originalDate);
    if (exception?.skipped) continue;
    const occurrenceDate = exception?.movedDate ?? originalDate;
    if (occurrenceDate < fromDate || occurrenceDate > throughDate) continue;
    const startTime = exception?.startTime ?? task.startTime;
    const durationMinutes = exception?.durationMinutes ?? task.durationMinutes;
    const [hour, minute] = startTime.split(":").map(Number);
    const end = Temporal.PlainTime.from({ hour, minute }).add({ minutes: durationMinutes });
    output.push({
      id: `${task.id}:${originalDate}`,
      seriesId: task.id,
      originalDate,
      occurrenceDate,
      title: exception?.title ?? task.title,
      startTime,
      endTime: exception?.endTime ?? end.toString({ smallestUnit: "minute" }),
      durationMinutes,
      completed: exception?.completed ?? task.completed,
      goalId: task.goalId,
      repeating: task.recurrence !== null,
    });
  }
  return output.sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate) || a.startTime.localeCompare(b.startTime));
}

export function dateInZone(timeZone: string, date = new Date()) {
  return Temporal.Instant.from(date.toISOString()).toZonedDateTimeISO(timeZone).toPlainDate().toString();
}
