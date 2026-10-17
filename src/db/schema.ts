import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export type RepeatRule = {
  frequency: "daily" | "weekly" | "every-n-days" | "weekdays";
  interval: number;
  weekdays: number[];
  endDate: string | null;
  count: number | null;
};

export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  scheduledDate: text("scheduled_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  goalId: text("goal_id").references(() => goals.id, { onDelete: "set null" }),
  recurrence: text("recurrence", { mode: "json" }).$type<RepeatRule | null>(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const occurrenceExceptions = sqliteTable(
  "occurrence_exceptions",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    originalDate: text("original_date").notNull(),
    title: text("title"),
    skipped: integer("skipped", { mode: "boolean" }).notNull().default(false),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
    movedDate: text("moved_date"),
    startTime: text("start_time"),
    endTime: text("end_time"),
    durationMinutes: integer("duration_minutes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("occurrence_task_date").on(table.taskId, table.originalDate)],
);

export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  timeZone: text("time_zone").notNull().default("Europe/London"),
  theme: text("theme", { enum: ["light", "dark", "system"] }).notNull().default("system"),
  updatedAt: text("updated_at").notNull(),
});
