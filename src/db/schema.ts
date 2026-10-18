import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export type RepeatRule = {
  frequency: "daily" | "weekly" | "every-n-days" | "weekdays";
  interval: number;
  weekdays: number[];
  endDate: string | null;
  count: number | null;
};

export type RoutineStep = { id: string; title: string; startTime: string; durationMinutes: number };
export type DashboardWidget = { id: "today" | "goals" | "calendar" | "routines" | "quick-add"; x: number; y: number; w: number; h: number };

export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  endDate: text("end_date"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const routines = sqliteTable("routines", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  steps: text("steps", { mode: "json" }).$type<RoutineStep[]>().notNull(),
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
  routineGroupId: text("routine_group_id"),
  routineName: text("routine_name"),
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
  accentColor: text("accent_color").notNull().default("#4b775f"),
  colorStyle: text("color_style", { enum: ["hue", "minimal"] }).notNull().default("hue"),
  fontStyle: text("font_style", { enum: ["current", "mono", "serif", "rounded", "thin"] }).notNull().default("current"),
  dashboardLayout: text("dashboard_layout", { mode: "json" }).$type<DashboardWidget[] | null>(),
  updatedAt: text("updated_at").notNull(),
});
