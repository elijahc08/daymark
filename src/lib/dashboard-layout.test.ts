import assert from "node:assert/strict";
import test from "node:test";
import { dashboardWidgetsFromGrid, defaultDashboardLayout, normalizeDashboardLayout, packDashboardWidgets } from "./dashboard-layout";

test("default and reordered widgets pack into whole and half-width columns", () => {
  const moved = packDashboardWidgets([defaultDashboardLayout[1], defaultDashboardLayout[0], defaultDashboardLayout[2]]);
  assert.deepEqual(moved.map(({ x, y, w }) => ({ x, y, w })), [
    { x: 0, y: 0, w: 6 },
    { x: 6, y: 0, w: 6 },
    { x: 0, y: 9, w: 12 },
  ]);
});

test("drag and resize geometry is persisted once in the 12-column layout", () => {
  const result = dashboardWidgetsFromGrid([
    { i: "goals", x: 0, y: 2, w: 12, h: 16 },
    { i: "today", x: 0, y: 19, w: 6, h: 30 },
  ], 12);
  assert.deepEqual(result, [
    { id: "goals", x: 0, y: 2, w: 12, h: 16 },
    { id: "today", x: 0, y: 19, w: 6, h: 30 },
  ]);
});

test("mobile geometry scales back to the desktop grid without thirds", () => {
  const result = dashboardWidgetsFromGrid([
    { i: "today", x: 2, y: 3, w: 2, h: 8 },
    { i: "quick-add", x: 0, y: 12, w: 2, h: 4 },
  ], 4);
  assert.deepEqual(result, [
    { id: "today", x: 6, y: 3, w: 6, h: 8 },
    { id: "quick-add", x: 0, y: 12, w: 6, h: 6 },
  ]);
});

test("legacy presets migrate and malformed saved layouts fall back safely", () => {
  const migrated = normalizeDashboardLayout([
    { id: "today", size: "medium", height: "regular" },
    { id: "goals", size: "large", height: "tall" },
    { id: "today", size: "large", height: "tall" },
    { id: "not-a-widget", size: "medium", height: "regular" },
  ] as never);
  assert.deepEqual(migrated, [
    { id: "today", x: 0, y: 0, w: 6, h: 8 },
    { id: "goals", x: 0, y: 9, w: 12, h: 16 },
  ]);
  assert.deepEqual(normalizeDashboardLayout(null), defaultDashboardLayout);
  assert.deepEqual(normalizeDashboardLayout("bad data" as never), defaultDashboardLayout);
});
