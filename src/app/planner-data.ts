import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { goals, occurrenceExceptions, routines, settings, tasks } from "@/src/db/schema";
import { dateInZone, occurrencesForRange } from "@/src/lib/recurrence";
import { initializeSettings } from "./actions";
import { Temporal } from "@js-temporal/polyfill";

export async function loadPlannerData() {
  await initializeSettings();
  const savedSettings = await db.select().from(settings).where(eq(settings.id, "default")).get();
  const timeZone = savedSettings?.timeZone ?? "Europe/London";
  const today = dateInZone(timeZone);
  const firstDay = Temporal.PlainDate.from(today).with({ day: 1 }).toString();
  const lastDay = Temporal.PlainDate.from(today).with({ day: 1 }).add({ months: 1 }).subtract({ days: 1 }).toString();
  const [goalRows, taskRows, exceptionRows, routineRows] = await Promise.all([
    db.select().from(goals).orderBy(goals.createdAt),
    db.select().from(tasks).orderBy(tasks.scheduledDate, tasks.startTime),
    db.select().from(occurrenceExceptions),
    db.select().from(routines).orderBy(routines.createdAt),
  ]);
  const exceptionsByTask = new Map<string, typeof exceptionRows>();
  for (const exception of exceptionRows) exceptionsByTask.set(exception.taskId, [...(exceptionsByTask.get(exception.taskId) ?? []), exception]);
  const items = taskRows.flatMap((task) => occurrencesForRange(task, exceptionsByTask.get(task.id) ?? [], firstDay, lastDay, timeZone));
  const goalNames = Object.fromEntries(goalRows.map((goal) => [goal.id, goal.title]));

  return {
    today,
    month: firstDay,
    timeZone,
    theme: savedSettings?.theme ?? "system",
    accentColor: savedSettings?.accentColor ?? "#4b775f",
    colorStyle: savedSettings?.colorStyle ?? "hue",
    fontStyle: savedSettings?.fontStyle ?? "current",
    dashboardLayout: savedSettings?.dashboardLayout ?? null,
    goals: goalRows,
    routines: routineRows,
    items,
    series: taskRows,
    goalNames,
  };
}
