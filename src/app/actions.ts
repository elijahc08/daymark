"use server";

import { randomUUID } from "node:crypto";
import { and, eq, gte, lte, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/src/db";
import { goals, occurrenceExceptions, settings, tasks, type RepeatRule } from "@/src/db/schema";
import { occurrencesForRange } from "@/src/lib/recurrence";
import { Temporal } from "@js-temporal/polyfill";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}$/;
function validDate(value: string) {
  if (!datePattern.test(value)) return false;
  try { Temporal.PlainDate.from(value); return true; } catch { return false; }
}
function validTime(value: string) {
  if (!timePattern.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}
const RepeatSchema = z.object({
  frequency: z.enum(["daily", "weekly", "every-n-days", "weekdays"]),
  interval: z.coerce.number().int().min(1).max(365),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).max(7),
  endDate: z.string().nullable(),
  count: z.number().int().min(1).max(10000).nullable(),
});

function now() {
  return new Date().toISOString();
}

function minuteOf(value: string) {
  if (!timePattern.test(value)) return NaN;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function endTimeFrom(startTime: string, duration: number) {
  const total = minuteOf(startTime) + duration;
  if (!Number.isFinite(total) || total > 24 * 60 - 1) return null;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export async function getRange(fromDate: string, throughDate: string) {
  if (!validDate(fromDate) || !validDate(throughDate) || fromDate > throughDate) return [];
  if (Temporal.PlainDate.from(fromDate).until(Temporal.PlainDate.from(throughDate), { largestUnit: "day" }).days > 365) return [];
  const [savedSettings, allTasks, allExceptions] = await Promise.all([
    db.select().from(settings).where(eq(settings.id, "default")).get(),
    db.select().from(tasks),
    db.select().from(occurrenceExceptions).where(or(
      and(lte(occurrenceExceptions.originalDate, throughDate), gte(occurrenceExceptions.originalDate, fromDate)),
      and(lte(occurrenceExceptions.movedDate, throughDate), gte(occurrenceExceptions.movedDate, fromDate)),
    )),
  ]);
  const timeZone = savedSettings?.timeZone ?? "Europe/London";
  const exceptions = new Map<string, typeof allExceptions>();
  for (const exception of allExceptions) exceptions.set(exception.taskId, [...(exceptions.get(exception.taskId) ?? []), exception]);
  const rows = allTasks.flatMap((task) => occurrencesForRange(task, exceptions.get(task.id) ?? [], fromDate, throughDate, timeZone));
  return rows.sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate) || a.startTime.localeCompare(b.startTime));
}

export async function createTask(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("scheduledDate") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const suppliedEnd = String(formData.get("endTime") ?? "");
  const suppliedDuration = String(formData.get("durationMinutes") ?? "");
  const goalId = String(formData.get("goalId") ?? "") || null;
  const repeatFrequency = String(formData.get("repeatFrequency") ?? "none");
  const repeatInterval = Number(formData.get("repeatInterval") ?? 1);
  const weekdays = formData.getAll("weekdays").map(Number);
  const endDate = String(formData.get("repeatEndDate") ?? "") || null;
  const countRaw = String(formData.get("repeatCount") ?? "");
  const duration = suppliedDuration ? Number(suppliedDuration) : minuteOf(suppliedEnd) - minuteOf(startTime);
  const endTime = suppliedEnd || endTimeFrom(startTime, duration) || "";

  const validation = z.object({
    title: z.string().min(1, "Add a task title.").max(160),
    date: z.string().refine(validDate, "Choose a valid date."),
    startTime: z.string().refine(validTime, "Choose a valid start time."),
    endTime: z.string().refine(validTime, "Choose a valid end time."),
    duration: z.number().int().min(1).max(1439),
    goalId: z.string().nullable(),
  }).safeParse({ title, date, startTime, endTime, duration, goalId });
  if (!validation.success) return { error: validation.error.issues[0]?.message ?? "Check the task details." };
  if (minuteOf(endTime) <= minuteOf(startTime) || minuteOf(endTime) - minuteOf(startTime) !== duration) {
    return { error: "End time must be after the start time and match the duration." };
  }
  if (goalId && !(await db.select({ id: goals.id }).from(goals).where(eq(goals.id, goalId)).get())) return { error: "That goal no longer exists." };

  let recurrence: RepeatRule | null = null;
  if (repeatFrequency !== "none") {
    const parsed = RepeatSchema.safeParse({
      frequency: repeatFrequency,
      interval: repeatInterval,
      weekdays,
      endDate,
      count: countRaw ? Number(countRaw) : null,
    });
    if (!parsed.success) return { error: "Check the repeat schedule." };
    if (parsed.data.frequency === "weekdays" && parsed.data.weekdays.length === 0) return { error: "Choose at least one weekday." };
    if (parsed.data.endDate && (!validDate(parsed.data.endDate) || parsed.data.endDate < date)) return { error: "Repeat end must be on or after the start date." };
    if (parsed.data.count && parsed.data.endDate) return { error: "Choose either an end date or an occurrence count." };
    recurrence = parsed.data;
  }

  const stamp = now();
  await db.insert(tasks).values({ id: randomUUID(), title, scheduledDate: date, startTime, endTime, durationMinutes: duration, goalId, recurrence, completed: false, createdAt: stamp, updatedAt: stamp });
  revalidatePath("/");
  return { ok: true };
}

export async function updateTask(id: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const scheduledDate = String(formData.get("scheduledDate") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const suppliedEnd = String(formData.get("endTime") ?? "");
  const suppliedDuration = String(formData.get("durationMinutes") ?? "");
  const goalId = String(formData.get("goalId") ?? "") || null;
  const recurrenceText = String(formData.get("recurrenceJson") ?? "");
  const durationMinutes = suppliedDuration ? Number(suppliedDuration) : minuteOf(suppliedEnd) - minuteOf(startTime);
  const endTime = suppliedEnd || endTimeFrom(startTime, durationMinutes) || "";
  const parsed = z.object({ title: z.string().trim().min(1).max(160), date: z.string().refine(validDate), start: z.string().refine(validTime), end: z.string().refine(validTime), duration: z.number().int().min(1).max(1439) }).safeParse({ title, date: scheduledDate, start: startTime, end: endTime, duration: durationMinutes });
  if (!parsed.success) return { error: "Check the title and scheduled time." };
  if (minuteOf(endTime) <= minuteOf(startTime) || minuteOf(endTime) - minuteOf(startTime) !== durationMinutes) return { error: "End time must be after the start time and match the duration." };
  let recurrence: RepeatRule | null = null;
  if (recurrenceText) {
    let recurrenceValue: unknown;
    try { recurrenceValue = JSON.parse(recurrenceText); } catch { return { error: "Check the repeat schedule." }; }
    const result = RepeatSchema.safeParse(recurrenceValue);
    if (!result.success) return { error: "Check the repeat schedule." };
    if (result.data.frequency === "weekdays" && result.data.weekdays.length === 0) return { error: "Choose at least one weekday." };
    if (result.data.endDate && (!validDate(result.data.endDate) || result.data.endDate < scheduledDate)) return { error: "Repeat end must be on or after the start date." };
    if (result.data.count && result.data.endDate) return { error: "Choose either an end date or an occurrence count." };
    recurrence = result.data;
  }
  if (goalId && !(await db.select({ id: goals.id }).from(goals).where(eq(goals.id, goalId)).get())) return { error: "That goal no longer exists." };
  await db.update(tasks).set({ title, scheduledDate, startTime, endTime, durationMinutes, goalId, recurrence, updatedAt: now() }).where(eq(tasks.id, id));
  revalidatePath("/");
  return { ok: true };
}

export async function saveOccurrence(taskId: string, originalDate: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const movedDate = String(formData.get("scheduledDate") ?? originalDate);
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  const durationMinutes = Number(formData.get("durationMinutes") ?? 0);
  if (!title || title.length > 160 || !validDate(originalDate) || !validDate(movedDate) || !validTime(startTime) || !validTime(endTime) || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1439 || minuteOf(endTime) <= minuteOf(startTime) || minuteOf(endTime) - minuteOf(startTime) !== durationMinutes) return { error: "Check the occurrence details." };
  if (!(await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).get())) return { error: "This repeating task no longer exists." };
  const stamp = now();
  await db.insert(occurrenceExceptions).values({ id: randomUUID(), taskId, originalDate, title, skipped: false, completed: false, movedDate, startTime, endTime, durationMinutes, createdAt: stamp, updatedAt: stamp }).onConflictDoUpdate({ target: [occurrenceExceptions.taskId, occurrenceExceptions.originalDate], set: { title, skipped: false, movedDate, startTime, endTime, durationMinutes, updatedAt: stamp } });
  revalidatePath("/");
  return { ok: true };
}

export async function setCompleted(taskId: string, occurrenceDate: string, completed: boolean) {
  if (!validDate(occurrenceDate) || typeof completed !== "boolean") return { error: "Check the completion change." };
  const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task) return { error: "This task no longer exists." };
  if (task.recurrence) {
    const stamp = now();
    await db.insert(occurrenceExceptions).values({ id: randomUUID(), taskId, originalDate: occurrenceDate, skipped: false, completed, createdAt: stamp, updatedAt: stamp }).onConflictDoUpdate({ target: [occurrenceExceptions.taskId, occurrenceExceptions.originalDate], set: { completed, skipped: false, updatedAt: stamp } });
  } else {
    await db.update(tasks).set({ completed, updatedAt: now() }).where(eq(tasks.id, taskId));
  }
  revalidatePath("/");
  return { ok: true };
}

export async function skipOccurrence(taskId: string, occurrenceDate: string) {
  if (!validDate(occurrenceDate)) return { error: "Choose a valid occurrence date." };
  const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task?.recurrence) return { error: "This repeating task no longer exists." };
  const stamp = now();
  await db.insert(occurrenceExceptions).values({ id: randomUUID(), taskId, originalDate: occurrenceDate, skipped: true, completed: false, createdAt: stamp, updatedAt: stamp }).onConflictDoUpdate({ target: [occurrenceExceptions.taskId, occurrenceExceptions.originalDate], set: { skipped: true, updatedAt: stamp } });
  revalidatePath("/");
  return { ok: true };
}

export async function deleteTask(id: string) {
  await db.delete(tasks).where(eq(tasks.id, id));
  revalidatePath("/");
}

export async function createGoal(title: string) {
  const parsed = z.string().trim().min(1, "Enter a goal name.").max(120).safeParse(title);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a goal name." };
  const stamp = now();
  await db.insert(goals).values({ id: randomUUID(), title: parsed.data, createdAt: stamp, updatedAt: stamp });
  revalidatePath("/");
  return { ok: true };
}

export async function deleteGoal(id: string) {
  await db.delete(goals).where(eq(goals.id, id));
  revalidatePath("/");
}

export async function saveSettings(timeZone: string, theme: "light" | "dark" | "system") {
  const validZone = z.string().refine((value) => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }, "Choose a valid time zone.").safeParse(timeZone);
  if (!validZone.success) return { error: "Choose a valid time zone." };
  const validTheme = z.enum(["light", "dark", "system"]).safeParse(theme);
  if (!validTheme.success) return { error: "Choose a valid appearance." };
  const stamp = now();
  await db.insert(settings).values({ id: "default", timeZone, theme, updatedAt: stamp }).onConflictDoUpdate({ target: settings.id, set: { timeZone, theme, updatedAt: stamp } });
  revalidatePath("/");
  return { ok: true };
}

export async function initializeSettings() {
  await db.insert(settings).values({ id: "default", timeZone: "Europe/London", theme: "system", updatedAt: now() }).onConflictDoNothing();
}
