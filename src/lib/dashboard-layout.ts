import type { DashboardWidget } from "../db/schema";

const widgetIds = new Set<DashboardWidget["id"]>(["today", "goals", "calendar", "routines", "quick-add"]);

export const defaultDashboardLayout: DashboardWidget[] = [
  { id: "today", x: 0, y: 0, w: 6, h: 8 },
  { id: "goals", x: 6, y: 0, w: 6, h: 8 },
  { id: "calendar", x: 0, y: 9, w: 12, h: 8 },
];

export function normalizeDashboardLayout(layout: DashboardWidget[] | null): DashboardWidget[] {
  if (!Array.isArray(layout)) return defaultDashboardLayout.map((widget) => ({ ...widget }));
  const raw = layout as unknown as Array<Record<string, unknown>>;
  const seen = new Set<string>();
  const normalized: DashboardWidget[] = [];
  raw.forEach((item, index) => {
    const id = item?.id;
    if (typeof id !== "string" || !widgetIds.has(id as DashboardWidget["id"]) || seen.has(id)) return;
    seen.add(id);
    if ([item.x, item.y, item.w, item.h].every((value) => typeof value === "number" && Number.isFinite(value))) {
      const w = Math.max(6, Math.min(12, Math.round(item.w as number)));
      normalized.push({ id: id as DashboardWidget["id"], x: Math.max(0, Math.min(12 - w, Math.round(item.x as number))), y: Math.max(0, Math.round(item.y as number)), w, h: Math.max(6, Math.round(item.h as number)) });
      return;
    }
    // Migrate dashboards saved by the earlier named-size controls.
    const w = item.size === "large" ? 12 : 6;
    const x = w === 12 ? 0 : index % 2 === 0 ? 0 : 6;
    const y = Math.floor(index / (w === 12 ? 1 : 2)) * 9;
    normalized.push({ id: id as DashboardWidget["id"], x, y, w, h: item.height === "tall" ? 16 : 8 });
  });
  return normalized;
}

export function packDashboardWidgets(widgets: DashboardWidget[]): DashboardWidget[] {
  return widgets.reduce<{ widgets: DashboardWidget[]; x: number; y: number; rowHeight: number }>((state, widget) => {
    const wrapped = state.x + widget.w > 12;
    const x = wrapped ? 0 : state.x;
    const y = wrapped ? state.y + state.rowHeight + 1 : state.y;
    const rowHeight = wrapped ? widget.h : Math.max(state.rowHeight, widget.h);
    const nextX = x + widget.w;
    const completeRow = nextX >= 12;
    return { widgets: [...state.widgets, { ...widget, x, y }], x: completeRow ? 0 : nextX, y: completeRow ? y + rowHeight + 1 : y, rowHeight: completeRow ? 0 : rowHeight };
  }, { widgets: [], x: 0, y: 0, rowHeight: 0 }).widgets;
}

export function dashboardWidgetsFromGrid(next: ReadonlyArray<{ i: string; x: number; y: number; w: number; h: number }>, columns: number): DashboardWidget[] {
  const scale = 12 / columns;
  return next.map((cell) => ({ id: cell.i as DashboardWidget["id"], x: Math.max(0, Math.round(cell.x * scale)), y: Math.max(0, Math.round(cell.y)), w: Math.max(6, Math.min(12, Math.round(cell.w * scale))), h: Math.max(6, Math.round(cell.h)) }));
}
