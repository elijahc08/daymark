"use client";

import { DayPicker, type DayButtonProps } from "@daypicker/react";
import "@daypicker/react/style.css";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HexColorInput, HexColorPicker } from "react-colorful";
import ReactGridLayout, { useContainerWidth, verticalCompactor, type Layout } from "react-grid-layout";
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createGoal, createTask, deleteGoal, deleteRoutine, deleteTask, getRange, saveDashboardLayout, saveOccurrence, saveRoutine, saveSettings, scheduleRoutine, setCompleted, setGoalCompleted, updateTask } from "./actions";
import type { DashboardWidget, RepeatRule, RoutineStep } from "@/src/db/schema";
import { dashboardWidgetsFromGrid, defaultDashboardLayout, normalizeDashboardLayout, packDashboardWidgets } from "@/src/lib/dashboard-layout";

type Item = { id: string; seriesId: string; originalDate: string; occurrenceDate: string; title: string; startTime: string; endTime: string; durationMinutes: number; completed: boolean; goalId: string | null; repeating: boolean; routineGroupId: string | null; routineName: string | null };
type Goal = { id: string; title: string; endDate: string | null; completed: boolean; createdAt: string; updatedAt: string };
type Series = { id: string; title: string; scheduledDate: string; startTime: string; endTime: string; durationMinutes: number; completed: boolean; goalId: string | null; recurrence: RepeatRule | null; routineGroupId: string | null; routineName: string | null; createdAt: string; updatedAt: string };
type Routine = { id: string; name: string; steps: RoutineStep[]; createdAt: string; updatedAt: string };
type Initial = { today: string; month: string; timeZone: string; theme: "light" | "dark" | "system"; accentColor: string; colorStyle: "hue" | "minimal"; fontStyle: "current" | "mono" | "serif" | "rounded" | "thin"; dashboardLayout: DashboardWidget[] | null; goals: Goal[]; routines: Routine[]; items: Item[]; series: Series[]; goalNames: Record<string, string>; view: View };
export type PlannerView = "Dashboard" | "Today" | "Calendar" | "All tasks" | "Goals" | "Routines";
type View = PlannerView;
type CalendarMode = "Week" | "Month" | "Year";

const views: View[] = ["Dashboard", "Today", "Calendar", "All tasks", "Goals", "Routines"];
const viewPaths: Record<View, string> = { Dashboard: "/", Today: "/today", Calendar: "/calendar", "All tasks": "/all-tasks", Goals: "/goals", Routines: "/routines" };
function viewFromPath(pathname: string): View {
  return (Object.entries(viewPaths).find(([, path]) => path === pathname)?.[0] as View | undefined) ?? "Dashboard";
}
const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function hexToHsl(hex: string) {
  const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const lightness = (maximum + minimum) / 2;
  let hue = 0;
  let saturation = 0;

  if (maximum !== minimum) {
    const difference = maximum - minimum;
    saturation = lightness > 0.5 ? difference / (2 - maximum - minimum) : difference / (maximum + minimum);
    if (maximum === red) hue = (green - blue) / difference + (green < blue ? 6 : 0);
    else if (maximum === green) hue = (blue - red) / difference + 2;
    else hue = (red - green) / difference + 4;
    hue /= 6;
  }

  return [hue * 360, saturation * 100] as const;
}

function accentTextColor(hue: number, saturation: number, lightness: number) {
  const h = hue / 60;
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const second = chroma * (1 - Math.abs(h % 2 - 1));
  const match = l - chroma / 2;
  const rgb = h < 1 ? [chroma, second, 0] : h < 2 ? [second, chroma, 0] : h < 3 ? [0, chroma, second] : h < 4 ? [0, second, chroma] : h < 5 ? [second, 0, chroma] : [chroma, 0, second];
  const linear = rgb.map((channel) => {
    const value = (channel + match) * 255 / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / 0.059;
  return whiteContrast >= darkContrast ? "#ffffff" : "#171c19";
}

const localDate = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
};
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;


type ChoiceOption = { value: string; label: string };

function SelectField({ label, name, value, options, onChange }: { label: string; name: string; value: string; options: ChoiceOption[]; onChange: (value: string) => void }) {
  return <label className="field full-width select-field">{label}<span className="select-control"><select name={name} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 7.5 5 5 5-5" /></svg></span></label>;
}

function CalendarIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><rect x="3" y="4.5" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M6.5 2.75v3.5M13.5 2.75v3.5M3.5 8h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

function ClockIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" /><path d="M10 5.8v4.5l3 1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function DatePickerField({ label, name, value, onChange, min, allowClear = true }: { label: string; name: string; value: string; onChange: (value: string) => void; min?: string; allowClear?: boolean }) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [popoverMaxHeight, setPopoverMaxHeight] = useState<number>();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    const placePopover = () => {
      const triggerRect = trigger.current?.getBoundingClientRect();
      if (!triggerRect) return;
      const dialogRect = root.current?.closest("dialog")?.getBoundingClientRect();
      const topLimit = Math.max(12, dialogRect?.top ?? 12);
      const bottomLimit = Math.min(window.innerHeight - 12, dialogRect?.bottom ?? window.innerHeight - 12);
      const spaceAbove = Math.max(0, triggerRect.top - topLimit - 7);
      const spaceBelow = Math.max(0, bottomLimit - triggerRect.bottom - 7);
      const neededHeight = popover.current?.scrollHeight ?? 310;
      setDropUp(spaceBelow < neededHeight && spaceAbove > spaceBelow);
      setPopoverMaxHeight(Math.max(160, Math.min(420, Math.max(spaceAbove, spaceBelow))));
    };
    const frame = requestAnimationFrame(placePopover);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", placePopover);
    document.addEventListener("scroll", placePopover, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); window.removeEventListener("resize", placePopover); document.removeEventListener("scroll", placePopover, true); };
  }, [open]);
  const selected = value ? localDate(value) : undefined;
  return <div className="field date-field" ref={root}><span className="field-label">{label}</span><button ref={trigger} type="button" className="date-picker-trigger" aria-haspopup="dialog" aria-expanded={open} aria-required={!allowClear || undefined} aria-label={`${label}${value ? `: ${prettyDate(value, { day: "numeric", month: "long", year: "numeric" })}` : "; choose date"}`} onClick={() => setOpen((current) => !current)}><span>{value ? prettyDate(value, { day: "numeric", month: "short", year: "numeric" }) : <span className="date-placeholder">Choose date</span>}</span><CalendarIcon /></button><input type="hidden" name={name} value={value} />{open && <div ref={popover} className={`picker-popover date-popover ${dropUp ? "is-above" : ""}`} style={popoverMaxHeight ? { maxHeight: `${popoverMaxHeight}px` } : undefined} role="dialog" aria-label={`${label} calendar`}><DayPicker mode="single" selected={selected} defaultMonth={selected ?? new Date()} weekStartsOn={1} disabled={min ? { before: localDate(min) } : undefined} autoFocus onSelect={(date) => { if (date) onChange(dateKey(date)); setOpen(false); trigger.current?.focus(); }} footer={<div className="date-popover-actions">{allowClear ? <button type="button" className="picker-quiet-button" onClick={() => { onChange(""); setOpen(false); trigger.current?.focus(); }}>Clear</button> : <span />}<button type="button" className="picker-quiet-button" disabled={Boolean(min && dateKey(new Date()) < min)} onClick={() => { const today = dateKey(new Date()); if (!min || today >= min) onChange(today); setOpen(false); trigger.current?.focus(); }}>Today</button></div>} /></div>}</div>;
}

function TimePickerField({ label, name, value, onChange }: { label: string; name: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); input.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  const selectSegment = (element: HTMLInputElement, position = element.selectionStart ?? 0) => {
    const start = position < 3 ? 0 : 3;
    element.setSelectionRange(start, start + 2);
  };
  const adjustSegment = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const match = /^(\d{1,2}):(\d{2})$/.exec(value);
    if (!match) return;
    event.preventDefault();
    const caret = event.currentTarget.selectionStart ?? 0;
    const hourSegment = caret < 3;
    const amount = event.key === "ArrowUp" ? 1 : -1;
    const current = Number(hourSegment ? match[1] : match[2]);
    const limit = hourSegment ? 24 : 60;
    const next = (current + amount + limit) % limit;
    const parts = hourSegment ? [String(next).padStart(2, "0"), match[2]] : [match[1].padStart(2, "0"), String(next).padStart(2, "0")];
    const segmentStart = hourSegment ? 0 : 3;
    const element = event.currentTarget;
    onChange(`${parts[0]}:${parts[1]}`);
    requestAnimationFrame(() => element.setSelectionRange(segmentStart, segmentStart + 2));
  };
  const suggestions = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);
  return <div className="field time-field" ref={root}><label htmlFor={`${name}-input`}>{label}</label><div className="time-entry"><input ref={input} id={`${name}-input`} name={name} type="text" inputMode="numeric" autoComplete="off" pattern="([01]?[0-9]|2[0-3]):[0-5][0-9]" required placeholder="09:00" value={value} onChange={(event) => onChange(event.target.value)} onClick={(event) => selectSegment(event.currentTarget)} onKeyDown={adjustSegment} onBlur={() => { if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) { const [hour, minute] = value.split(":"); onChange(`${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`); } }} aria-label={`${label}, 24-hour time`} aria-keyshortcuts="ArrowUp ArrowDown" title="Click the hour or minute; the selected part is highlighted. Use the up or down arrow key to change it" /><button type="button" className="time-picker-toggle" aria-label={`Choose ${label.toLowerCase()}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}><ClockIcon /></button></div>{open && <div className="picker-popover time-popover"><p>Choose a time</p><div className="time-suggestions" role="listbox" aria-label={`${label} options`}>{suggestions.map((time) => <button key={time} type="button" role="option" aria-selected={value === time} className={value === time ? "is-selected" : ""} onClick={() => { onChange(time); setOpen(false); input.current?.focus(); }}>{time}</button>)}</div></div>}</div>;
}
const addDays = (date: string, count: number) => {
  const value = localDate(date); value.setDate(value.getDate() + count); return dateKey(value);
};
const addYears = (date: string, count: number) => {
  const [year, month, day] = date.split("-").map(Number);
  const targetYear = year + count;
  const lastDay = new Date(targetYear, month, 0, 12).getDate();
  return `${targetYear}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
};
const weekBounds = (date: string) => {
  const offset = (localDate(date).getDay() + 6) % 7;
  return [addDays(date, -offset), addDays(date, 6 - offset)] as const;
};
const yearBounds = (year: number) => [`${year}-01-01`, `${year}-12-31`] as const;
const daysBetween = (from: string, through: string) => {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [throughYear, throughMonth, throughDay] = through.split("-").map(Number);
  return (Date.UTC(throughYear, throughMonth - 1, throughDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / 86400000;
};
const monthBounds = (month: Date) => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12);
  return [dateKey(first), dateKey(last)] as const;
};
const prettyDate = (iso: string, options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) => new Intl.DateTimeFormat("en-GB", options).format(localDate(iso));
const addMinutesToTime = (time: string, minutes: number) => {
  if (!time) return "";
  const [hours, mins] = time.split(":").map(Number);
  const value = hours * 60 + mins + minutes;
  if (value >= 1440 || value < 0) return "";
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
};

const MonthItemsContext = createContext<Record<string, Item[]>>({});

function MonthDayButton({ day, children, ...buttonProps }: DayButtonProps) {
  const itemsByDate = useContext(MonthItemsContext);
  const key = dateKey(day.date);
  const dayItems = itemsByDate[key] ?? [];
  const description = dayItems.map((item) => `${item.startTime} to ${item.endTime} ${item.title}`).join(", ");
  return <button {...buttonProps} aria-label={`${prettyDate(key)}${description ? `. ${description}` : ". No tasks scheduled."}`}>
    <span className="month-day-number">{children}</span>
    <span className="month-event-list" aria-hidden="true">
      {dayItems.slice(0, 3).map((item) => <span className={`month-event ${item.completed ? "done" : ""}`} key={item.id}><time>{item.startTime}–{item.endTime}</time> {item.title}</span>)}
      {dayItems.length > 3 && <span className="month-event-more">+{dayItems.length - 3} more</span>}
    </span>
  </button>;
}

export function Planner({ initial }: { initial: Initial }) {
  const pathname = usePathname();
  const router = useRouter();
  const view = viewFromPath(pathname);
  const setView = useCallback((nextView: View) => {
    const path = viewPaths[nextView];
    if (path !== pathname) router.push(path);
  }, [pathname, router]);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("Month");
  const [items, setItems] = useState(initial.items);
  const [goals, setGoals] = useState(initial.goals);
  const [animatingOut, setAnimatingOut] = useState<string[]>([]);
  const [month, setMonth] = useState(localDate(initial.month));
  const [selectedDate, setSelectedDate] = useState(initial.today);
  const [today] = useState(initial.today);
  const initialAllTasksThrough = addDays(initial.today, 13);
  const allTasksThroughRef = useRef(initialAllTasksThrough);
  const allTasksLoadLock = useRef(false);
  const allTasksAutoLoadArmed = useRef(false);
  const allTasksSentinel = useRef<HTMLDivElement>(null);
  const [loadingMoreAllTasks, setLoadingMoreAllTasks] = useState(false);
  const [allTasksLoadError, setAllTasksLoadError] = useState("");
  const [hasMoreAllTasks, setHasMoreAllTasks] = useState(true);
  const [timeZone] = useState(initial.timeZone);
  const [theme, setTheme] = useState(initial.theme);
  const [accentColor, setAccentColor] = useState(initial.accentColor);
  const [colorStyle, setColorStyle] = useState(initial.colorStyle);
  const [fontStyle, setFontStyle] = useState(initial.fontStyle);
  const savedAppearance = useRef({ theme: initial.theme, accentColor: initial.accentColor, colorStyle: initial.colorStyle, fontStyle: initial.fontStyle });
  const [search, setSearch] = useState("");
  const [taskDialog, setTaskDialog] = useState<{ series?: Series; occurrence?: Item; date: string } | null>(null);
  const [goalDialog, setGoalDialog] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState("");
  const selectedWeek = weekBounds(selectedDate);
  const selectedYear = Number(selectedDate.slice(0, 4));
  const dateFrom = view === "Today" ? today : view === "Calendar"
    ? calendarMode === "Week" ? selectedWeek[0] : calendarMode === "Year" ? yearBounds(selectedYear)[0] : monthBounds(month)[0]
    : monthBounds(month)[0];
  const dateThrough = view === "Today" ? today : view === "Calendar"
    ? calendarMode === "Week" ? selectedWeek[1] : calendarMode === "Year" ? yearBounds(selectedYear)[1] : monthBounds(month)[1]
    : monthBounds(month)[1];

  async function refreshRange(from = view === "All tasks" ? today : dateFrom, through = view === "All tasks" ? allTasksThroughRef.current : dateThrough) {
    try {
      setRangeError("");
      setItems(await getRange(from, through));
    } catch {
      setRangeError("Tasks could not be loaded. Check the connection to your local database and try again.");
    }
  }

  const loadNextAllTasksWeek = useCallback(async () => {
    if (allTasksLoadLock.current || !hasMoreAllTasks) return;
    const currentThrough = allTasksThroughRef.current;
    const remainingDays = 365 - daysBetween(today, currentThrough);
    if (remainingDays <= 0) { setHasMoreAllTasks(false); return; }
    const nextFrom = addDays(currentThrough, 1);
    const nextThrough = addDays(currentThrough, Math.min(7, remainingDays));
    allTasksLoadLock.current = true;
    allTasksAutoLoadArmed.current = false;
    setLoadingMoreAllTasks(true);
    setAllTasksLoadError("");
    try {
      const rows = await getRange(nextFrom, nextThrough);
      setItems((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        return [...current, ...rows.filter((item) => !existingIds.has(item.id))];
      });
      allTasksThroughRef.current = nextThrough;
      setHasMoreAllTasks(daysBetween(today, nextThrough) < 365);
    } catch {
      setAllTasksLoadError("The next week could not be loaded. Try again.");
    } finally {
      allTasksLoadLock.current = false;
      setLoadingMoreAllTasks(false);
    }
  }, [hasMoreAllTasks, today]);

  useEffect(() => {
    if (view !== "All tasks") return;
    let current = true;
    const loadingTimer = window.setTimeout(() => { if (current) { setRangeLoading(true); setRangeError(""); setAllTasksLoadError(""); } }, 0);
    getRange(today, allTasksThroughRef.current).then((rows) => { if (current) setItems(rows); })
      .catch(() => { if (current) setRangeError("Tasks could not be loaded. Check the connection to your local database and try again."); })
      .finally(() => { window.clearTimeout(loadingTimer); if (current) setRangeLoading(false); });
    return () => { current = false; window.clearTimeout(loadingTimer); };
  }, [view, today]);

  useEffect(() => {
    if (view === "All tasks") return;
    let current = true;
    const loadingTimer = window.setTimeout(() => {
      if (current) {
        setRangeLoading(true);
        setRangeError("");
      }
    }, 0);
    getRange(dateFrom, dateThrough).then((rows) => { if (current) setItems(rows); })
      .catch(() => { if (current) setRangeError("Tasks could not be loaded. Check the connection to your local database and try again."); })
      .finally(() => { window.clearTimeout(loadingTimer); if (current) setRangeLoading(false); });
    return () => { current = false; window.clearTimeout(loadingTimer); };
  }, [dateFrom, dateThrough, view]);
  useEffect(() => {
    const root = document.documentElement;
    const [hue, saturation] = hexToHsl(accentColor);
    root.dataset.theme = theme;
    root.dataset.palette = colorStyle;
    root.dataset.font = fontStyle;
    root.style.setProperty("--custom-hue", String(Math.round(hue)));
    root.style.setProperty("--custom-saturation", String(Math.round(saturation)) + "%");
    root.style.setProperty("--surface-saturation", String(Math.min(Math.round(saturation * 0.35), 20)) + "%");
    root.style.setProperty("--accent-text-light", colorStyle === "minimal" ? "#ffffff" : accentTextColor(hue, saturation, 40));
    root.style.setProperty("--accent-text-dark", colorStyle === "minimal" ? "#171c19" : accentTextColor(hue, saturation, 74));
  }, [theme, accentColor, colorStyle, fontStyle]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditable = target instanceof HTMLElement && (
        target.isContentEditable ||
        target.matches("input, textarea, select, [role='textbox']")
      );
      if (event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey &&
        event.key.toLowerCase() === "n" && !event.isComposing && !isEditable &&
        !document.querySelector("dialog[open]")) {
        event.preventDefault();
        setTaskDialog({ date: selectedDate || today });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedDate, today]);

  const matchingItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = items.filter((item) => item.title.toLowerCase().includes(query));
    if (view === "Today") return filtered.filter((item) => item.occurrenceDate === today);
    if (view === "Calendar") return filtered.filter((item) => item.occurrenceDate === selectedDate);
    return filtered;
  }, [items, search, selectedDate, today, view]);
  const visibleItems = matchingItems.filter((item) => !item.completed || animatingOut.includes(item.id));
  const completedItems = matchingItems.filter((item) => item.completed && !animatingOut.includes(item.id));
  const groupedItems = useMemo(() => visibleItems.reduce<Record<string, Item[]>>((groups, item) => {
    (groups[item.occurrenceDate] ??= []).push(item);
    return groups;
  }, {}), [visibleItems]);
  const hasAllTaskRows = Object.keys(groupedItems).length > 0 || completedItems.length > 0;

  useEffect(() => {
    if (view !== "All tasks" || !hasMoreAllTasks || rangeLoading || rangeError || !hasAllTaskRows || !allTasksSentinel.current) return;
    allTasksAutoLoadArmed.current = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) { allTasksAutoLoadArmed.current = true; return; }
      if (allTasksAutoLoadArmed.current) void loadNextAllTasksWeek();
    }, { rootMargin: "0px 0px 220px 0px" });
    observer.observe(allTasksSentinel.current);
    return () => observer.disconnect();
  }, [view, hasMoreAllTasks, hasAllTaskRows, loadNextAllTasksWeek, rangeLoading, rangeError]);
  const itemsByDate = useMemo(() => items.filter((item) => !item.completed || animatingOut.includes(item.id)).reduce<Record<string, Item[]>>((groups, item) => {
    (groups[item.occurrenceDate] ??= []).push(item);
    return groups;
  }, {}), [animatingOut, items]);
  const selectedSeries = taskDialog?.series;
  const selectedOccurrence = taskDialog?.occurrence;

  function showMessage(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }

  function reloadWithNotice(message: string) {
    window.sessionStorage.setItem("daymark-notice", message);
    window.location.reload();
  }

  useEffect(() => {
    const savedNotice = window.sessionStorage.getItem("daymark-notice");
    if (savedNotice) {
      window.sessionStorage.removeItem("daymark-notice");
      window.setTimeout(() => {
        setNotice(savedNotice);
        window.setTimeout(() => setNotice(""), 2600);
      }, 0);
    }
  }, []);

  async function handleTask(formData: FormData) {
    try {
      const result = selectedOccurrence?.repeating
        ? await saveOccurrence(selectedOccurrence.seriesId, selectedOccurrence.originalDate, formData)
        : selectedSeries
          ? await updateTask(selectedSeries.id, formData)
          : await createTask(formData);
      if (result?.error) return result.error;
      if (!selectedOccurrence?.repeating) {
        reloadWithNotice(selectedSeries ? "Task updated." : "Task added.");
        return "";
      }
      setTaskDialog(null);
      await refreshRange();
      showMessage(selectedOccurrence ? "Occurrence updated." : "Task updated.");
      return "";
    } catch {
      return "The task could not be saved. Please try again.";
    }
  }

  async function toggleComplete(item: Item) {
    try {
      const result = await setCompleted(item.seriesId, item.originalDate, !item.completed);
      if (result?.error) { showMessage(result.error); return; }
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, completed: !item.completed } : row));
      if (!item.completed) {
        setAnimatingOut((current) => current.includes(item.id) ? current : [...current, item.id]);
        window.setTimeout(() => setAnimatingOut((current) => current.filter((id) => id !== item.id)), 620);
      }
      showMessage(item.completed ? "Task marked incomplete." : "Task completed.");
    } catch { showMessage("The task could not be updated. Please try again."); }
  }

  function moveMonth(direction: number) {
    if (calendarMode === "Week") {
      const next = addDays(selectedDate, direction * 7);
      setSelectedDate(next);
      setMonth(localDate(next));
    } else if (calendarMode === "Year") {
      const nextDate = addYears(selectedDate, direction);
      setSelectedDate(nextDate);
      setMonth(localDate(nextDate));
    } else {
      const nextMonth = new Date(month.getFullYear(), month.getMonth() + direction, 1, 12);
      setMonth(nextMonth);
      setSelectedDate(dateKey(nextMonth));
    }
  }

  function editItem(item: Item) {
    const series = initial.series.find((row) => row.id === item.seriesId);
    if (series) setTaskDialog({ series, occurrence: item, date: item.occurrenceDate });
  }

  async function removeItem(item: Item) {
    const scope = item.repeating ? " and every occurrence in its series" : "";
    if (!window.confirm(`Delete “${item.title}”${scope}?`)) return;
    try {
      await deleteTask(item.seriesId);
      await refreshRange();
      showMessage(item.repeating ? "Task series deleted." : "Task deleted.");
    } catch { showMessage("The task could not be deleted. Please try again."); }
  }

  function showCalendarMode(mode: CalendarMode) {
    setCalendarMode(mode);
    setMonth(localDate(selectedDate));
  }

  function calendarTitle() {
    if (calendarMode === "Year") return String(selectedYear);
    if (calendarMode === "Month") return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(month);
    const [start, end] = selectedWeek;
    return `${prettyDate(start, { day: "numeric", month: "short" })} – ${prettyDate(end, { day: "numeric", month: "short", year: "numeric" })}`;
  }

  async function handleGoal(title: string, endDate: string) {
    try {
      const result = await createGoal(title, endDate);
      if (result?.error) return result.error;
      reloadWithNotice("Goal added.");
      return "";
    } catch { return "The goal could not be saved. Please try again."; }
  }

  async function toggleGoal(goal: Goal, completed: boolean) {
    try {
      const result = await setGoalCompleted(goal.id, completed);
      if (result?.error) { showMessage(result.error); return; }
      setGoals((current) => current.map((row) => row.id === goal.id ? { ...row, completed } : row));
      showMessage(completed ? "Goal completed." : "Goal marked in progress.");
    } catch { showMessage("The goal could not be updated. Please try again."); }
  }

  function closeSettings() {
    setTheme(savedAppearance.current.theme);
    setAccentColor(savedAppearance.current.accentColor);
    setColorStyle(savedAppearance.current.colorStyle);
    setFontStyle(savedAppearance.current.fontStyle);
    setSettingsOpen(false);
  }

  async function handleSettings(zone: string, selectedTheme: "light" | "dark" | "system", selectedColor: string, selectedColorStyle: "hue" | "minimal", selectedFontStyle: Initial["fontStyle"]) {
    try {
      const result = await saveSettings(zone, selectedTheme, selectedColor, selectedColorStyle, selectedFontStyle);
      if (result?.error) return result.error;
      savedAppearance.current = { theme: selectedTheme, accentColor: selectedColor, colorStyle: selectedColorStyle, fontStyle: selectedFontStyle };
      reloadWithNotice("Settings saved.");
      return "";
    } catch { return "Settings could not be saved. Please try again."; }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark">d.</span><span>daymark</span></Link>
      <div className="sidebar-caption">YOUR SPACE</div>
      <nav aria-label="Main navigation" className="main-nav">
        {views.map((name) => <Link key={name} href={viewPaths[name]} className={`nav-item ${view === name ? "active" : ""}`} aria-current={view === name ? "page" : undefined}>
          <span className={`nav-icon nav-icon-${name.toLowerCase().replace(" ", "-")}`} aria-hidden="true">{name === "Calendar" && <CalendarIcon />}</span>{name}
        </Link>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="profile-chip"><span className="avatar">E</span><span><strong>Personal</strong><small>Private planner</small></span></div>
      </div>
    </aside>

    <main className="main-content">
      <header className="topbar">
        <div className="mobile-brand"><span className="brand-mark">d.</span> daymark</div>
        <label className="search-box"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks" aria-label="Search tasks" /></label>
        <div className="top-actions"><button type="button" className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings"><span className="nav-icon nav-icon-settings" aria-hidden="true" /></button><button className="add-button" aria-keyshortcuts="Shift+N" onClick={() => setTaskDialog({ date: selectedDate || today })}><svg className="add-task-icon" aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg> Add task</button></div>
      </header>
      <div className="page-body">
        <div className="page-heading">
          <div><p className="eyebrow">{view === "Today" ? "YOUR DAY" : view === "Dashboard" ? "A CLEAR VIEW OF WHAT MATTERS" : view === "Routines" ? "REPEATABLE PLANS" : "YOUR PLANNER"}</p><h1>{view === "Today" ? "Today" : view}</h1>{view !== "Dashboard" && <p className="page-subtitle">{view === "Today" ? prettyDate(today) : view === "Calendar" ? "See your plans by week, month or year." : view === "All tasks" ? "Your upcoming plans, grouped by day." : view === "Routines" ? "Save a set of tasks and add it to your day whenever you need it." : "Small steps toward what matters to you."}</p>}</div>
        </div>

        {view === "Dashboard" && <Dashboard items={items} goals={goals} routines={initial.routines} today={today} layout={initial.dashboardLayout} setView={setView} onAddTask={() => setTaskDialog({ date: today })} onMessage={showMessage} />}
        {view === "Goals" && <GoalsPanel goals={goals} openGoal={() => setGoalDialog(true)} toggleGoal={toggleGoal} showMessage={showMessage} />}
        {view === "Routines" && <RoutinesPanel routines={initial.routines} today={today} onMessage={showMessage} onScheduled={(date) => { setSelectedDate(date); setMonth(localDate(date)); setCalendarMode("Week"); setView("Calendar"); }} onSaved={reloadWithNotice} />}
        {view === "Calendar" && <section className="calendar-view" aria-label="Calendar">
          <div className="calendar-controls">
            <div className="calendar-tabs" role="group" aria-label="Calendar view">
              {(["Week", "Month", "Year"] as const).map((mode) => <button key={mode} aria-pressed={calendarMode === mode} className={calendarMode === mode ? "active" : ""} onClick={() => showCalendarMode(mode)}>{mode}</button>)}
            </div>
            <div className="calendar-period"><button className="icon-button" onClick={() => moveMonth(-1)} aria-label={`Previous ${calendarMode.toLowerCase()}`}>‹</button><h2>{calendarTitle()}</h2><button className="icon-button" onClick={() => moveMonth(1)} aria-label={`Next ${calendarMode.toLowerCase()}`}>›</button><button className="today-button" onClick={() => { setMonth(localDate(today)); setSelectedDate(today); }}>Today</button></div>
          </div>
          {rangeError && <div className="inline-error" role="alert"><span>{rangeError}</span><button className="quiet-button" onClick={() => refreshRange()}>Try again</button></div>}
          {rangeLoading ? <div className="calendar-loading" role="status">Loading scheduled tasks…</div> : calendarMode === "Week"
            ? <div className="week-fill"><CalendarWeek startDate={selectedWeek[0]} selectedDate={selectedDate} today={today} itemsByDate={itemsByDate} onSelectDate={setSelectedDate} onAdd={(date) => setTaskDialog({ date })} onEdit={(item) => editItem(item)} /></div>
            : calendarMode === "Month"
              ? <CalendarSplit
                  calendar={<section className="calendar-card"><MonthItemsContext.Provider value={itemsByDate}><DayPicker mode="single" month={month} selected={localDate(selectedDate)} onSelect={(date) => date && setSelectedDate(dateKey(date))} onMonthChange={(value) => { setMonth(value); setSelectedDate(dateKey(value)); }} hideNavigation fixedWeeks weekStartsOn={1} components={{ DayButton: MonthDayButton }} aria-label="Calendar month" footer={`${Object.keys(itemsByDate).length} days with scheduled tasks`} /></MonthItemsContext.Provider></section>}
                  agenda={<section className="agenda-card"><div className="section-heading"><div><h2>{prettyDate(selectedDate, { weekday: "long", day: "numeric", month: "long" })}</h2><p>{visibleItems.length} {visibleItems.length === 1 ? "task" : "tasks"}</p></div><button className="text-button" onClick={() => setTaskDialog({ date: selectedDate })}>＋ Add</button></div><TaskList items={visibleItems} animatingOut={animatingOut} goalNames={initial.goalNames} onToggle={toggleComplete} onEdit={(item) => editItem(item)} onDelete={removeItem} emptySearch={search.trim()} onEmptyAdd={() => setTaskDialog({ date: selectedDate })} /></section>}
                />
              : <CalendarYear year={selectedYear} months={itemsByDate} goals={goals} onOpenMonth={(value) => { setCalendarMode("Month"); setMonth(value); setSelectedDate(dateKey(value)); }} onAddGoal={() => setGoalDialog(true)} onViewGoals={() => setView("Goals")} />}
        </section>}
        {(view === "Today" || view === "All tasks") && <section className="list-panel">
          {view === "All tasks" ? <>
            {rangeLoading ? <div className="calendar-loading" role="status">Loading tasks…</div> : rangeError ? <div className="inline-error" role="alert"><span>{rangeError}</span><button className="quiet-button" onClick={() => refreshRange()}>Try again</button></div> : Object.keys(groupedItems).length === 0 && completedItems.length === 0 ? <EmptyState view={view} search={search.trim()} onAdd={() => setTaskDialog({ date: today })} /> : <>{Object.entries(groupedItems).sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => <section className="day-group" key={date}><h2>{date === today ? "Today" : prettyDate(date)}</h2><TaskList items={rows} animatingOut={animatingOut} goalNames={initial.goalNames} onToggle={toggleComplete} onEdit={(item) => editItem(item)} onDelete={removeItem} /></section>)}{completedItems.length > 0 && <details className="completed-disclosure"><summary>Completed · {completedItems.length}</summary><TaskList items={completedItems} goalNames={initial.goalNames} onToggle={toggleComplete} onEdit={(item) => editItem(item)} onDelete={removeItem} /></details>}</>}
            {!rangeLoading && !rangeError && hasAllTaskRows && <div className="all-tasks-pagination">
              <div ref={allTasksSentinel} className="all-tasks-load-sentinel" aria-hidden="true" />
              {allTasksLoadError && <div className="inline-error" role="alert"><span>{allTasksLoadError}</span><button className="quiet-button" onClick={() => loadNextAllTasksWeek()}>Try again</button></div>}
              {loadingMoreAllTasks && <p className="quiet" role="status">Loading more tasks…</p>}
            </div>}
          </> : rangeLoading ? <div className="calendar-loading" role="status">Loading tasks…</div> : rangeError ? <div className="inline-error" role="alert"><span>{rangeError}</span><button className="quiet-button" onClick={() => refreshRange()}>Try again</button></div> : Object.keys(groupedItems).length === 0 && completedItems.length === 0 ? <EmptyState view={view} search={search.trim()} onAdd={() => setTaskDialog({ date: today })} /> : <>{Object.entries(groupedItems).sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => <section className="day-group" key={date}><h2>{date === today ? "Today" : prettyDate(date)}</h2><TaskList items={rows} animatingOut={animatingOut} goalNames={initial.goalNames} onToggle={toggleComplete} onEdit={(item) => editItem(item)} onDelete={removeItem} /></section>)}{completedItems.length > 0 && <details className="completed-disclosure"><summary>Completed · {completedItems.length}</summary><TaskList items={completedItems} goalNames={initial.goalNames} onToggle={toggleComplete} onEdit={(item) => editItem(item)} onDelete={removeItem} /></details>}</>}
        </section>}
      </div>
    </main>

    <nav className="mobile-nav" aria-label="Main navigation">{views.map((name) => <Link key={name} href={viewPaths[name]} className={view === name ? "active" : ""} aria-current={view === name ? "page" : undefined}><span className={`nav-icon nav-icon-${name.toLowerCase().replace(" ", "-")}`} aria-hidden="true">{name === "Calendar" && <CalendarIcon />}</span><span className="mobile-nav-label">{name === "Dashboard" ? "Home" : name}</span></Link>)}</nav>
    {notice && <div className="toast" role="status">{notice}</div>}
    {taskDialog && <TaskDialog key={`${selectedSeries?.id ?? "new"}-${selectedOccurrence?.occurrenceDate ?? "series"}`} series={selectedSeries} occurrence={selectedOccurrence} date={taskDialog.date} goals={goals} onClose={() => setTaskDialog(null)} onSubmit={handleTask} />}
    {goalDialog && <GoalDialog onClose={() => setGoalDialog(false)} onSubmit={handleGoal} />}
    {settingsOpen && <SettingsDialog timeZone={timeZone} theme={theme} accentColor={accentColor} colorStyle={colorStyle} fontStyle={fontStyle} onPreview={(nextTheme, nextColor, nextStyle, nextFont) => { setTheme(nextTheme); setAccentColor(nextColor); setColorStyle(nextStyle); setFontStyle(nextFont); }} onClose={closeSettings} onSubmit={handleSettings} />}
  </div>;
}

const widgetTitles: Record<DashboardWidget["id"], string> = { today: "Today", goals: "Goals", calendar: "Calendar", routines: "Routines", "quick-add": "Add Task" };

function Dashboard({ items, goals, routines, today, layout, setView, onAddTask, onMessage }: { items: Item[]; goals: Goal[]; routines: Routine[]; today: string; layout: DashboardWidget[] | null; setView: (view: View) => void; onAddTask: () => void; onMessage: (message: string) => void }) {
  const [savedWidgets, setSavedWidgets] = useState<DashboardWidget[]>(() => normalizeDashboardLayout(layout));
  const [widgets, setWidgets] = useState<DashboardWidget[]>(savedWidgets);
  const [editing, setEditing] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [selectedWidget, setSelectedWidget] = useState<DashboardWidget["id"] | null>(null);
  const [saving, setSaving] = useState(false);
  const { width, containerRef, mounted } = useContainerWidth();
  const columns = width < 700 ? 4 : 12;
  const gridLayout: Layout = widgets.map((widget) => {
    const scale = columns / 12;
    const w = Math.max(columns === 12 ? 6 : 2, Math.min(columns, Math.round(widget.w * scale)));
    return { i: widget.id, x: Math.max(0, Math.min(columns - w, Math.round(widget.x * scale))), y: widget.y, w, h: widget.h, minW: columns === 12 ? 6 : 2, minH: 6, maxW: columns };
  });
  const todayItems = items.filter((item) => item.occurrenceDate === today && !item.completed);
  const calendarItems = items.filter((item) => item.occurrenceDate >= today && !item.completed).slice(0, 5);
  const available = (Object.keys(widgetTitles) as DashboardWidget["id"][]).filter((id) => !widgets.some((widget) => widget.id === id));

  function reorder(id: DashboardWidget["id"], offset: number) {
    setWidgets((current) => { const from = current.findIndex((widget) => widget.id === id); const to = Math.max(0, Math.min(current.length - 1, from + offset)); const next = [...current]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return packDashboardWidgets(next); });
  }
  function updateFromGrid(next: Layout) {
    const updated = dashboardWidgetsFromGrid(next, columns);
    setWidgets((current) => JSON.stringify(current) === JSON.stringify(updated) ? current : updated);
  }
  async function save() {
    setSaving(true);
    try { const result = await saveDashboardLayout(widgets); if (result?.error) { onMessage(result.error); return; } setSavedWidgets(widgets); setSelectedWidget(null); setEditing(false); onMessage("Dashboard saved."); }
    catch { onMessage("The dashboard could not be saved. Please try again."); }
    finally { setSaving(false); }
  }
  function add(id: DashboardWidget["id"]) { setWidgets((current) => packDashboardWidgets([...current, { id, x: 0, y: 0, w: 6, h: 8 }])); setAddMenuOpen(false); }
  function card(widget: DashboardWidget) {
    const header = (eyebrow: string, title: string, icon: ReactNode) => <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><span className="summary-icon" aria-hidden="true">{icon}</span></div>;
    return <section className={`dashboard-card dashboard-widget dashboard-widget-${widget.id}`} aria-label={`${widgetTitles[widget.id]} widget`}>
      {editing && <div className={`dashboard-widget-tools ${selectedWidget === widget.id ? "selected" : ""}`}><button type="button" className="dashboard-drag-handle" aria-label={`Select or drag ${widgetTitles[widget.id]} widget`} aria-pressed={selectedWidget === widget.id} title="Select or drag to move" onClick={() => setSelectedWidget((selected) => selected === widget.id ? null : widget.id)}>⠿</button>{selectedWidget === widget.id && <><button type="button" onClick={() => reorder(widget.id, -1)} aria-label={`Move ${widgetTitles[widget.id]} earlier`}>Move earlier</button><button type="button" onClick={() => reorder(widget.id, 1)} aria-label={`Move ${widgetTitles[widget.id]} later`}>Move later</button><button type="button" className="dashboard-delete-widget" onClick={() => { setWidgets((current) => current.filter((item) => item.id !== widget.id)); setSelectedWidget(null); }} aria-label={`Delete ${widgetTitles[widget.id]} widget`}>Delete</button></>}</div>}
      {widget.id === "today" && <>{header("TODAY", todayItems.length ? `${todayItems.length} scheduled` : "A little room to begin", "☼")}{todayItems.slice(0, 5).map((item) => <div className="mini-task" key={item.id}><span className="mini-check" /><span>{item.title}</span><time>{item.startTime}</time></div>)}{!todayItems.length && <p className="quiet">Your day is open. Add something you want to make time for.</p>}<button className="card-link" onClick={() => setView("Today")}>Open today <span>→</span></button></>}
      {widget.id === "goals" && <>{header("GOALS", "Keep the bigger picture", "✳")}{goals.slice(0, 5).map((goal) => <div className="goal-line" key={goal.id}><span className="goal-spark">✳</span>{goal.title}</div>)}{goals.length === 0 && <p className="quiet">Add a goal, then link tasks to it when you plan your week.</p>}<button className="card-link" onClick={() => setView("Goals")}>View goals <span>→</span></button></>}
      {widget.id === "calendar" && <>{header("UP NEXT", "Your calendar", <CalendarIcon />)}{calendarItems.slice(0, 5).map((item) => <div className="upcoming-line" key={item.id}><span className="upcoming-day">{prettyDate(item.occurrenceDate, { weekday: "short", day: "numeric" })}</span><span>{item.title}</span><time>{item.startTime}</time></div>)}{calendarItems.length === 0 && <p className="quiet">Your upcoming plans will show here.</p>}<button className="card-link" onClick={() => setView("Calendar")}>Open calendar <span>→</span></button></>}
      {widget.id === "routines" && <>{header("ROUTINES", "Routines", "↻")}{routines.slice(0, 5).map((routine) => <div className="goal-line" key={routine.id}><span className="goal-spark">↻</span>{routine.name}<span className="dashboard-widget-meta">{routine.steps.length}</span></div>)}{!routines.length && <p className="quiet">No routines saved.</p>}<button className="card-link" onClick={() => setView("Routines")}>View routines <span>→</span></button></>}
      {widget.id === "quick-add" && <><div className="section-heading dashboard-quick-add-heading"><h2>Add Task</h2></div><button className="dashboard-quick-add" onClick={onAddTask} aria-label="Add a task"><span aria-hidden="true">＋</span></button></>}
    </section>;
  }

  return <section className={`dashboard-editor ${editing ? "is-editing" : ""}`} aria-label="Dashboard widgets">
    <div className="dashboard-toolbar">{editing ? <><span>Drag the grip to move. Resize from the lower-right corner.</span><div className="dashboard-toolbar-actions"><button className="secondary-button" onClick={() => { setWidgets(savedWidgets); setSelectedWidget(null); setEditing(false); }}>Cancel</button><button className="add-button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save dashboard"}</button></div></> : <div className="dashboard-toolbar-actions"><button className="secondary-button" onClick={() => setEditing(true)}>Edit dashboard</button></div>}</div>
    {editing && <div className="dashboard-add-tools"><button className="secondary-button" onClick={() => setAddMenuOpen((open) => !open)} aria-expanded={addMenuOpen}>＋ Add a widget</button>{addMenuOpen && <div className="dashboard-add-menu" role="group" aria-label="Available dashboard widgets">{available.length ? available.map((id) => <button key={id} onClick={() => add(id)}>{widgetTitles[id]} <span>＋</span></button>) : <span className="quiet">All widgets are on your dashboard.</span>}</div>}<button className="text-button" onClick={() => { setWidgets(defaultDashboardLayout); setSelectedWidget(null); }}>Reset layout</button></div>}
    <div ref={containerRef} className="dashboard-grid-shell">{mounted && widgets.length > 0 && <ReactGridLayout width={width} layout={gridLayout} gridConfig={{ cols: columns, rowHeight: 28, margin: [16, 16], containerPadding: [0, 0] }} compactor={verticalCompactor} dragConfig={{ enabled: editing, handle: ".dashboard-drag-handle", cancel: "button:not(.dashboard-drag-handle)" }} resizeConfig={{ enabled: editing, handles: ["se"] }} onDragStop={(next: Layout) => { if (editing) updateFromGrid(next); }} onResizeStop={(next: Layout) => { if (editing) updateFromGrid(next); }}>
      {widgets.map((widget) => <div key={widget.id} className="dashboard-grid-item">{card(widget)}</div>)}
    </ReactGridLayout>}{mounted && widgets.length === 0 && <div className="dashboard-empty"><h2>Your dashboard is clear</h2><p>Add a widget to bring back the information you want to see here.</p>{editing && <button className="secondary-button" onClick={() => setAddMenuOpen(true)}>＋ Add a widget</button>}</div>}</div>
  </section>;
}

function CalendarSplit({ calendar, agenda }: { calendar: ReactNode; agenda: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(0.64);
  const [dragging, setDragging] = useState(false);
  const clamp = (value: number) => Math.min(0.78, Math.max(0.38, value));

  useEffect(() => {
    const saved = Number(window.localStorage.getItem("daymark-calendar-split"));
    if (Number.isFinite(saved) && saved >= 0.38 && saved <= 0.78) setRatio(saved);
  }, []);

  function persist(next: number) {
    const value = clamp(next);
    setRatio(value);
    window.localStorage.setItem("daymark-calendar-split", String(value));
  }

  function updateFromClientX(clientX: number) {
    const rect = root.current?.getBoundingClientRect();
    if (!rect?.width) return;
    persist((clientX - rect.left) / rect.width);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    updateFromClientX(event.clientX);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    updateFromClientX(event.clientX);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  }

  return <div ref={root} className={`calendar-split${dragging ? " is-dragging" : ""}`} style={{ "--calendar-split": `${Math.round(ratio * 1000) / 10}%` } as CSSProperties}>
    <div className="calendar-split-pane is-calendar">{calendar}</div>
    <button type="button" className={`calendar-splitter${dragging ? " is-dragging" : ""}`} aria-label="Resize calendar and selected day" aria-orientation="vertical" aria-valuemin={38} aria-valuemax={78} aria-valuenow={Math.round(ratio * 100)} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onKeyDown={(event) => {
      if (event.key === "ArrowLeft") { event.preventDefault(); persist(ratio - 0.03); }
      if (event.key === "ArrowRight") { event.preventDefault(); persist(ratio + 0.03); }
      if (event.key === "Home") { event.preventDefault(); persist(0.38); }
      if (event.key === "End") { event.preventDefault(); persist(0.78); }
    }}><span className="calendar-splitter-bar" aria-hidden="true" /></button>
    <div className="calendar-split-pane is-agenda">{agenda}</div>
  </div>;
}

function CalendarWeek({ startDate, selectedDate, today, itemsByDate, onSelectDate, onAdd, onEdit }: { startDate: string; selectedDate: string; today: string; itemsByDate: Record<string, Item[]>; onSelectDate: (date: string) => void; onAdd: (date: string) => void; onEdit: (item: Item) => void }) {
  const dates = Array.from({ length: 7 }, (_, index) => addDays(startDate, index));
  return <div className="week-scroll" aria-label="Tasks for this week"><div className="week-grid">
    {dates.map((date) => {
      const dayItems = itemsByDate[date] ?? [];
      return <section className={`week-day ${date === selectedDate ? "selected" : ""} ${date === today ? "today" : ""}`} key={date} aria-label={prettyDate(date)}>
        <button className="week-day-heading" onClick={() => onSelectDate(date)} aria-pressed={date === selectedDate}><span>{prettyDate(date, { weekday: "short" })}</span><strong>{localDate(date).getDate()}</strong></button>
        {dayItems.length ? <div className="week-events">{dayItems.map((item) => <button key={item.id} className={`week-event ${item.completed ? "done" : ""}`} onClick={() => onEdit(item)}><time>{item.startTime}–{item.endTime}</time><span>{item.title}</span></button>)}</div> : <p className="week-empty">Nothing planned</p>}
        <button className="week-add" onClick={() => onAdd(date)}>＋ Add task</button>
      </section>;
    })}
  </div></div>;
}

function CalendarYear({ year, months, goals, onOpenMonth, onAddGoal, onViewGoals }: { year: number; months: Record<string, Item[]>; goals: Goal[]; onOpenMonth: (month: Date) => void; onAddGoal: () => void; onViewGoals: () => void }) {
  const monthCards = Array.from({ length: 12 }, (_, index) => {
    const month = new Date(year, index, 1, 12);
    const prefix = `${year}-${String(index + 1).padStart(2, "0")}`;
    const monthItems = Object.entries(months).filter(([date]) => date.startsWith(prefix)).flatMap(([, rows]) => rows);
    return { month, name: new Intl.DateTimeFormat("en-GB", { month: "long" }).format(month), items: monthItems };
  });
  return <div className="year-layout">
    <section className="year-calendar" aria-label={`${year} month overview`}>
      {monthCards.map(({ month, name, items }) => <button className="year-month" key={name} onClick={() => onOpenMonth(month)}><span className="year-month-title">{name}</span><strong>{items.length ? `${items.length} ${items.length === 1 ? "task" : "tasks"}` : "Open month"}</strong><span className="year-month-preview">{items.slice(0, 2).map((item) => `${localDate(item.occurrenceDate).getDate()} · ${item.title}`).join("\n") || "Plan something here"}</span><span className="year-month-open">View month →</span></button>)}
    </section>
    <section className="year-goals">
      <div className="section-heading"><div><p className="eyebrow">THE BIGGER PICTURE</p><h2>Goals to guide {year}</h2><p>Use your goals to decide what deserves time this year.</p></div><span className="summary-icon" aria-hidden="true">✳</span></div>
      {goals.length ? <ul className="year-goal-list">{goals.slice(0, 5).map((goal) => <li key={goal.id}><span className="goal-spark" aria-hidden="true">✳</span>{goal.title}</li>)}</ul> : <p className="quiet">Start with one clear goal. You can link tasks to it as you plan.</p>}
      <div className="year-goal-actions"><button className="add-button" onClick={onAddGoal}>＋ Add a goal</button><button className="text-button" onClick={onViewGoals}>View all goals →</button></div>
    </section>
  </div>;
}

function newRoutineStep(): RoutineStep {
  return { id: crypto.randomUUID(), title: "", startTime: "09:00", durationMinutes: 15 };
}

function nextRoutineStartTime(steps: RoutineStep[]) {
  const previous = steps.at(-1);
  if (!previous) return "09:00";
  const [hours, minutes] = previous.startTime.split(":").map(Number);
  const nextMinute = hours * 60 + minutes + previous.durationMinutes;
  if (!Number.isFinite(nextMinute) || nextMinute > 23 * 60 + 59) return null;
  return `${String(Math.floor(nextMinute / 60)).padStart(2, "0")}:${String(nextMinute % 60).padStart(2, "0")}`;
}

function RoutinesPanel({ routines, today, onMessage, onScheduled, onSaved }: { routines: Routine[]; today: string; onMessage: (message: string) => void; onScheduled: (date: string) => void; onSaved: (message: string) => void }) {
  const [editing, setEditing] = useState<Routine | null | false>(false);
  const [scheduling, setScheduling] = useState<Routine | null>(null);
  async function remove(routine: Routine) {
    if (!window.confirm(`Delete the “${routine.name}” routine template? Scheduled tasks will remain in your planner.`)) return;
    try {
      const result = await deleteRoutine(routine.id);
      if (result?.error) { onMessage(result.error); return; }
      onSaved("Routine deleted.");
    } catch { onMessage("The routine could not be deleted. Please try again."); }
  }
  return <section className="routines-panel">
    <div className="section-heading"><div><h2>Your routines</h2><p>Save a set of tasks, then add the whole section to a day or repeat it.</p></div><button className="add-button" onClick={() => setEditing(null)}>＋ New routine</button></div>
    {routines.length ? <div className="routine-grid">{routines.map((routine) => <article className="routine-card" key={routine.id}><div className="routine-card-heading"><h3>{routine.name}</h3><span>{routine.steps.length} {routine.steps.length === 1 ? "task" : "tasks"}</span></div><ol>{[...routine.steps].sort((a, b) => a.startTime.localeCompare(b.startTime)).map((step) => <li key={step.id}><time>{step.startTime}</time><span>{step.title}</span><small>{step.durationMinutes} min</small></li>)}</ol><div className="routine-card-actions"><button type="button" className="add-button" onClick={() => setScheduling(routine)}>Add to a day</button><button type="button" className="secondary-button" onClick={() => setEditing(routine)}>Edit</button><button type="button" className="quiet-button routine-delete" onClick={() => remove(routine)}>Delete</button></div></article>)}</div> : <div className="empty-state routine-empty"><div className="empty-illustration" aria-hidden="true">↻</div><h2>Make a plan once</h2><p>Create a morning, evening, or work routine with the tasks and times you want to repeat.</p><button className="add-button" onClick={() => setEditing(null)}>＋ Create a routine</button></div>}
    {editing !== false && <RoutineEditorDialog routine={editing ?? undefined} onClose={() => setEditing(false)} onSaved={onSaved} />}
    {scheduling && <ScheduleRoutineDialog routine={scheduling} today={today} onClose={() => setScheduling(null)} onMessage={onMessage} onScheduled={(date) => { setScheduling(null); onScheduled(date); }} />}
  </section>;
}

function RoutineEditorDialog({ routine, onClose, onSaved }: { routine?: Routine; onClose: () => void; onSaved: (message: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(routine?.name ?? "");
  const [steps, setSteps] = useState<RoutineStep[]>(() => routine?.steps.length ? routine.steps : [newRoutineStep()]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const nextStartTime = nextRoutineStartTime(steps);
  useEffect(() => { ref.current?.showModal(); }, []);
  function updateStep(id: string, changes: Partial<RoutineStep>) {
    setSteps((current) => current.map((step) => step.id === id ? { ...step, ...changes } : step));
  }
  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const result = await saveRoutine(routine?.id ?? null, name, steps);
      if (result?.error) { setError(result.error); return; }
      onSaved(routine ? "Routine updated." : "Routine saved.");
    } catch { setError("The routine could not be saved. Please try again."); }
    finally { setSubmitting(false); }
  }
  return <dialog ref={ref} className="modal modal-routine-editor" onCancel={onClose}>
    <button type="button" className="task-dialog-close" onClick={onClose} aria-label="Close routine editor">×</button>
    <form action={submit} className="routine-editor-form">
      <label className="field full-width">Routine name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required autoFocus placeholder="Morning routine" /></label>
      <div className="routine-step-editor full-width"><div className="routine-step-heading"><h3>Tasks in this routine</h3><span>Set the time and length for each task.</span></div>{steps.map((step) => <div className="routine-step-fields" key={step.id}><label className="field">Task<input value={step.title} onChange={(event) => updateStep(step.id, { title: event.target.value })} maxLength={160} required placeholder="Brush my teeth" /></label><TimePickerField label="Start" name={`routine-${step.id}`} value={step.startTime} onChange={(startTime) => updateStep(step.id, { startTime })} /><label className="field">Minutes<input type="number" min="1" max="1439" value={step.durationMinutes} onChange={(event) => updateStep(step.id, { durationMinutes: Number(event.target.value) })} required /></label><button type="button" className="quiet-button routine-remove-step" disabled={steps.length === 1} onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id))} aria-label={`Remove ${step.title || "task"}`}>×</button></div>)}<button type="button" className="text-button routine-add-step" disabled={nextStartTime === null} onClick={() => { if (nextStartTime) setSteps((current) => [...current, { ...newRoutineStep(), startTime: nextStartTime }]); }}>＋ Add a task</button>{nextStartTime === null && <p className="quiet routine-time-limit" role="status">There is no time left today after the last task. Adjust its time or duration to add another.</p>}</div>
      {error && <p className="form-error full-width" role="alert">{error}</p>}
      <div className="form-actions full-width"><button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>Cancel</button><button className="add-button" disabled={submitting}>{submitting ? "Saving…" : routine ? "Save routine" : "Create routine"}</button></div>
    </form>
  </dialog>;
}

function ScheduleRoutineDialog({ routine, today, onClose, onMessage, onScheduled }: { routine: Routine; today: string; onClose: () => void; onMessage: (message: string) => void; onScheduled: (date: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [scheduledDate, setScheduledDate] = useState(today);
  const [frequency, setFrequency] = useState("none");
  const [interval, setInterval] = useState("1");
  const [endDate, setEndDate] = useState("");
  const [count, setCount] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const result = await scheduleRoutine(routine.id, scheduledDate, frequency, frequency === "every-other-week" ? 2 : Number(interval), endDate, count, weekdays);
      if (result?.error) { setError(result.error); return; }
      onMessage(`“${routine.name}” added to your planner.`);
      onScheduled(scheduledDate);
    } catch { setError("The routine could not be added. Please try again."); }
    finally { setSubmitting(false); }
  }
  return <dialog ref={ref} className="modal modal-small" onCancel={onClose}>
    <div className="modal-heading"><div><p className="eyebrow">ADD A SECTION</p><h2>{routine.name}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close routine scheduling">×</button></div>
    <form action={submit} className="task-form"><DatePickerField label="Start date" name="routineStartDate" value={scheduledDate} onChange={setScheduledDate} allowClear={false} /><SelectField label="Repeat" name="routineRepeat" value={frequency} onChange={setFrequency} options={[{ value: "none", label: "Does not repeat" }, { value: "daily", label: "Every day" }, { value: "weekly", label: "Every week" }, { value: "every-other-week", label: "Every other week" }, { value: "every-n-days", label: "Every N days" }, { value: "weekdays", label: "Selected weekdays" }]} />
      {frequency !== "none" && <>
        {(frequency === "every-n-days" || frequency === "weekly") && <label className="field">Repeat every ({frequency === "weekly" ? "weeks" : "days"})<input type="number" min="1" max="365" value={interval} onChange={(event) => setInterval(event.target.value)} /></label>}
        {frequency === "weekdays" && <fieldset className="weekday-field full-width"><legend>Repeat on</legend><div className="weekday-options">{weekdayNames.map((day, index) => <label key={day}><input type="checkbox" checked={weekdays.includes(index)} onChange={(event) => setWeekdays((current) => event.target.checked ? [...current, index].sort() : current.filter((item) => item !== index))} /><span>{day.slice(0, 2)}</span></label>)}</div></fieldset>}
        <DatePickerField label="End after date" name="routineEndDate" value={endDate} min={scheduledDate} onChange={(value) => { setEndDate(value); if (value) setCount(""); }} />
        <label className="field">Or after occurrences<input type="number" min="1" max="10000" placeholder="No end" value={count} onChange={(event) => { setCount(event.target.value); if (event.target.value) setEndDate(""); }} /></label>
      </>}
      {error && <p className="form-error full-width" role="alert">{error}</p>}
      <div className="form-actions full-width"><button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>Cancel</button><button className="add-button" disabled={submitting}>{submitting ? "Adding…" : "Add routine"}</button></div>
    </form>
  </dialog>;
}

function TaskList({ items, animatingOut = [], goalNames, onToggle, onEdit, onDelete, emptySearch = "", onEmptyAdd }: { items: Item[]; animatingOut?: string[]; goalNames: Record<string, string>; onToggle: (item: Item) => void; onEdit: (item: Item) => void; onDelete: (item: Item) => void; emptySearch?: string; onEmptyAdd?: () => void }) {
  if (!items.length) return emptySearch && onEmptyAdd ? <div className="search-empty-state" role="status"><h3>No results for “{emptySearch}”</h3><p>Try another search or create a task.</p><button type="button" className="add-button" onClick={onEmptyAdd}>＋ Create task</button></div> : <div className="quiet small-empty">Nothing scheduled.</div>;
  return <div className="task-list">{items.map((item, index) => <Fragment key={item.id}>{item.routineGroupId && (index === 0 || items[index - 1]?.routineGroupId !== item.routineGroupId) && <h3 className="task-section-heading">{item.routineName}</h3>}<article className={`task-row ${item.completed ? "completed" : ""} ${animatingOut.includes(item.id) ? "task-row-dismissing" : ""}`} onClick={(event) => { const target = event.target; if (target instanceof HTMLElement && target.closest("button, a, input, select, textarea")) return; onEdit(item); }}>
    <button className={`task-check ${item.completed ? "checked" : ""}`} onClick={() => onToggle(item)} aria-label={item.completed ? `Mark ${item.title} incomplete` : `Complete ${item.title}`} aria-pressed={item.completed}>{item.completed && <span aria-hidden="true">✓</span>}</button>
    <div className="task-copy"><button type="button" className="task-title-button" onClick={() => onEdit(item)}><strong>{item.title}</strong></button><div className="task-meta"><time>{item.startTime} – {item.endTime}</time>{goalNames[item.goalId ?? ""] && <span className="task-goal">{goalNames[item.goalId ?? ""]}</span>}{item.repeating && <span className="repeat-tag" title="Repeating task">↻</span>}</div></div>
    <div className="task-actions"><button onClick={() => onEdit(item)} title={item.repeating ? "Edit this occurrence" : "Edit task"}>Edit</button><button className="delete-task-button" onClick={() => onDelete(item)} title="Delete task or series">Delete</button></div>
  </article></Fragment>)}</div>;
}

function EmptyState({ view, search, onAdd }: { view: View; search: string; onAdd: () => void }) {
  if (search) return <div className="empty-state search-empty-state" role="status"><div className="empty-illustration" aria-hidden="true">⌕</div><h2>No results for “{search}”</h2><p>Try another search or create a task.</p><button className="add-button" onClick={onAdd}>＋ Create task</button></div>;
  return <div className="empty-state"><div className="empty-illustration" aria-hidden="true">✳</div><h2>{view === "Today" ? "Make space for what matters" : "A fresh page"}</h2><p>{view === "Today" ? "Nothing is planned for today yet. Add a task and give it a time." : "No tasks in this range. A small plan is a good place to start."}</p><button className="add-button" onClick={onAdd}>＋ Add your first task</button></div>;
}

function TaskDialog({ series, occurrence, date, goals, onClose, onSubmit }: { series?: Series; occurrence?: Item; date: string; goals: Goal[]; onClose: () => void; onSubmit: (data: FormData) => Promise<string> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const startValue = occurrence?.startTime ?? series?.startTime ?? "09:00";
  const initialDuration = occurrence?.durationMinutes ?? series?.durationMinutes ?? 60;
  const [startTime, setStartTime] = useState(startValue);
  const [duration, setDuration] = useState(String(initialDuration));
  const [endTime, setEndTime] = useState(occurrence?.endTime ?? series?.endTime ?? addMinutesToTime(startValue, initialDuration));
  const [scheduledDate, setScheduledDate] = useState(occurrence ? occurrence.occurrenceDate : series?.scheduledDate ?? date);
  const recurrence = series?.recurrence;
  const isOccurrence = Boolean(occurrence?.repeating);
  type RepeatFrequency = "none" | "daily" | "weekly" | "every-other-week" | "every-n-days" | "weekdays";
  const initialFrequency: RepeatFrequency = recurrence?.frequency === "weekly" && recurrence.interval === 2
    ? "every-other-week"
    : recurrence?.frequency ?? "none";
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>(initialFrequency);
  const [goalId, setGoalId] = useState(series?.goalId ?? "");
  const [repeatInterval, setRepeatInterval] = useState(String(recurrence?.interval ?? 1));
  const [weekdays, setWeekdays] = useState<number[]>(recurrence?.weekdays ?? []);
  const [repeatEndDate, setRepeatEndDate] = useState(recurrence?.endDate ?? "");
  const [repeatCount, setRepeatCount] = useState(recurrence?.count?.toString() ?? "");

  useEffect(() => { ref.current?.showModal(); }, []);
  function changeStart(value: string) {
    setStartTime(value);
    if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) setEndTime(addMinutesToTime(value, Number(duration)));
  }
  function changeDuration(value: string) {
    setDuration(value);
    if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(startTime)) setEndTime(addMinutesToTime(startTime, Number(value)));
  }
  async function submit(formData: FormData) {
    setSubmitting(true);
    setError("");
    try { setError(await onSubmit(formData)); }
    catch { setError("The task could not be saved. Please try again."); }
    finally { setSubmitting(false); }
  }
  const storedFrequency = repeatFrequency === "every-other-week" ? "weekly" : repeatFrequency;
  const recurrenceJson = repeatFrequency === "none" ? "" : JSON.stringify({
    frequency: storedFrequency,
    interval: repeatFrequency === "every-other-week" ? 2 : Number(repeatInterval),
    weekdays,
    endDate: repeatEndDate || null,
    count: repeatCount ? Number(repeatCount) : null,
  });

  return <dialog ref={ref} className="modal task-dialog" onCancel={onClose} onClick={(event) => { if (event.target === ref.current) onClose(); }}>
    <button type="button" className="task-dialog-close" onClick={onClose} aria-label="Close form">×</button>
    <form action={submit} className="task-form">
      <label className="field full-width task-title-field">Task title<input name="title" maxLength={160} required defaultValue={occurrence?.title ?? series?.title ?? ""} placeholder="What would you like to do?" autoFocus /></label>
      <DatePickerField label="Date" name="scheduledDate" value={scheduledDate} onChange={setScheduledDate} allowClear={false} />
      <TimePickerField label="Start time" name="startTime" value={startTime} onChange={changeStart} />
      <TimePickerField label="End time" name="endTime" value={endTime} onChange={(value) => { setEndTime(value); if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value) && /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(startTime)) { const [h1,m1]=startTime.split(":").map(Number); const [h2,m2]=value.split(":").map(Number); setDuration(String(h2*60+m2-(h1*60+m1))); } }} />
      <label className="field">Duration (minutes)<input name="durationMinutes" type="number" min="1" max="1439" required value={duration} onChange={(event) => changeDuration(event.target.value)} /></label>
      {!isOccurrence && <SelectField label="Link to a goal" name="goalId" value={goalId} onChange={setGoalId} options={[{ value: "", label: "No goal" }, ...goals.map((goal) => ({ value: goal.id, label: goal.title }))]} />}
      {!isOccurrence && <>
        <SelectField label="Repeat" name="repeatFrequency" value={repeatFrequency} onChange={(raw) => { const next = raw as RepeatFrequency; setRepeatFrequency(next); if (next === "every-other-week") setRepeatInterval("2"); else if (next === "weekly" && repeatFrequency === "every-other-week") setRepeatInterval("1"); }} options={[{ value: "none", label: "Does not repeat" }, { value: "daily", label: "Every day" }, { value: "weekly", label: "Every week" }, { value: "every-other-week", label: "Every other week" }, { value: "every-n-days", label: "Every N days" }, { value: "weekdays", label: "Selected weekdays" }]} />
        {repeatFrequency !== "none" && <>
          {(repeatFrequency === "every-n-days" || repeatFrequency === "weekly") && <label className="field">{repeatFrequency === "weekly" ? "Repeat every (weeks)" : "Repeat every (days)"}<input id="repeat-interval" name="repeatInterval" type="number" min="1" max="365" value={repeatInterval} onChange={(event) => setRepeatInterval(event.target.value)} /></label>}
          {repeatFrequency === "weekdays" && <fieldset className="weekday-field full-width"><legend>Repeat on</legend><div className="weekday-options">{weekdayNames.map((name, index) => <label key={name}><input type="checkbox" name="weekdays" value={index} checked={weekdays.includes(index)} onChange={(event) => setWeekdays((value) => event.target.checked ? [...value, index].sort() : value.filter((day) => day !== index))} /><span>{name.slice(0, 2)}</span></label>)}</div></fieldset>}
          <DatePickerField label="End after date" name="repeatEndDate" value={repeatEndDate} min={series?.scheduledDate ?? scheduledDate} onChange={(value) => { setRepeatEndDate(value); if (value) setRepeatCount(""); }} />
          <label className="field">Or after occurrences<input name="repeatCount" type="number" min="1" max="10000" placeholder="No end" value={repeatCount} onChange={(event) => { setRepeatCount(event.target.value); if (event.target.value) setRepeatEndDate(""); }} /></label>
        </>}
      </>}
      {series && !isOccurrence && <input type="hidden" name="recurrenceJson" value={recurrenceJson} />}
      {error && <p className="form-error full-width" role="alert">{error}</p>}
      <div className="form-actions full-width"><button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>Cancel</button><button className="add-button" type="submit" disabled={submitting}>{submitting ? "Saving…" : isOccurrence ? "Save this occurrence" : "Save task"}</button></div>
    </form>
  </dialog>;
}

function GoalDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (title: string, endDate: string) => Promise<string> }) {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [endDate, setEndDate] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="modal modal-small" onCancel={onClose}><div className="modal-heading"><div><p className="eyebrow">AIM WITH INTENTION</p><h2>Add a goal</h2></div><button className="icon-button" onClick={onClose} aria-label="Close form">×</button></div><form action={async (data) => { setSubmitting(true); setError(""); try { setError(await onSubmit(String(data.get("title") ?? ""), String(data.get("endDate") ?? ""))); } catch { setError("The goal could not be saved. Please try again."); } finally { setSubmitting(false); } }} className="task-form"><label className="field full-width">Goal name<input name="title" required maxLength={120} placeholder="What matters to you?" autoFocus /></label><DatePickerField label="End date (optional)" name="endDate" value={endDate} onChange={setEndDate} />{error && <p role="alert" className="form-error full-width">{error}</p>}<div className="form-actions full-width"><button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>Cancel</button><button className="add-button" disabled={submitting}>{submitting ? "Saving…" : "Save goal"}</button></div></form></dialog>;
}

function SettingsDialog({ timeZone, theme, accentColor, colorStyle, fontStyle, onClose, onPreview, onSubmit }: { timeZone: string; theme: "light" | "dark" | "system"; accentColor: string; colorStyle: "hue" | "minimal"; fontStyle: Initial["fontStyle"]; onClose: () => void; onPreview: (theme: "light" | "dark" | "system", color: string, style: "hue" | "minimal", font: Initial["fontStyle"]) => void; onSubmit: (zone: string, theme: "light" | "dark" | "system", color: string, style: "hue" | "minimal", font: Initial["fontStyle"]) => Promise<string> }) {
  const [zone, setZone] = useState(timeZone);
  const [selectedTheme, setSelectedTheme] = useState(theme);
  const [selectedColor, setSelectedColor] = useState(accentColor);
  const [selectedColorStyle, setSelectedColorStyle] = useState(colorStyle);
  const [selectedFontStyle, setSelectedFontStyle] = useState(fontStyle);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  async function submit(data: FormData) {
    setSubmitting(true);
    setError("");
    try { setError(await onSubmit(String(data.get("timeZone") ?? zone), selectedTheme, selectedColor, selectedColorStyle, selectedFontStyle)); }
    catch { setError("Settings could not be saved. Please try again."); }
    finally { setSubmitting(false); }
  }
  function changeTheme(value: "light" | "dark" | "system") {
    setSelectedTheme(value);
    onPreview(value, selectedColor, selectedColorStyle, selectedFontStyle);
  }
  function changeColor(value: string) {
    setSelectedColor(value);
    onPreview(selectedTheme, value, selectedColorStyle, selectedFontStyle);
  }
  function changeColorStyle(value: "hue" | "minimal") {
    setSelectedColorStyle(value);
    onPreview(selectedTheme, selectedColor, value, selectedFontStyle);
  }
  function changeFontStyle(value: Initial["fontStyle"]) {
    setSelectedFontStyle(value);
    onPreview(selectedTheme, selectedColor, selectedColorStyle, value);
  }
  return <dialog ref={ref} className="modal modal-settings" onCancel={onClose}><div className="modal-heading"><div><p className="eyebrow">MAKE IT YOURS</p><h2>Settings</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close settings">×</button></div><form action={submit} className="task-form"><label className="field full-width">Time zone<input name="timeZone" value={zone} onChange={(event) => setZone(event.target.value)} placeholder="Europe/London" required /></label><SelectField label="Appearance" name="theme" value={selectedTheme} onChange={(value) => changeTheme(value as typeof theme)} options={[{ value: "system", label: "Use device setting" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} /><SelectField label="Font style" name="fontStyle" value={selectedFontStyle} onChange={(value) => changeFontStyle(value as Initial["fontStyle"])} options={[{ value: "current", label: "System" }, { value: "mono", label: "Monospace" }, { value: "serif", label: "Serif" }, { value: "rounded", label: "Rounded sans" }, { value: "thin", label: "Light sans" }]} /><SelectField label="Colour style" name="colorStyle" value={selectedColorStyle} onChange={(value) => changeColorStyle(value as typeof colorStyle)} options={[{ value: "hue", label: "Custom hue" }, { value: "minimal", label: "Minimal" }]} />{selectedColorStyle === "hue" ? <fieldset className="field full-width color-picker-field"><legend>App hue</legend><div className="accent-picker-layout"><HexColorPicker color={selectedColor} onChange={changeColor} aria-label="Choose the app hue" /><div className="accent-picker-value"><span className="accent-preview-swatch" style={{ backgroundColor: selectedColor }} aria-hidden="true" /><HexColorInput color={selectedColor} onChange={changeColor} prefixed aria-label="App hue hex value" /></div></div></fieldset> : null}{error && <p role="alert" className="form-error full-width">{error}</p>}<div className="form-actions full-width"><button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>Cancel</button><button className="add-button" disabled={submitting}>{submitting ? "Saving…" : "Save settings"}</button></div></form><details className="keyboard-shortcuts"><summary>Keyboard shortcuts</summary><ul><li><span>Create a task</span><kbd className="shortcut-combo"><span>Shift</span><span aria-hidden="true">+</span><span>N</span></kbd></li></ul></details></dialog>;
}

function GoalsPanel({ goals, openGoal, toggleGoal, showMessage }: { goals: Goal[]; openGoal: () => void; toggleGoal: (goal: Goal, completed: boolean) => void; showMessage: (message: string) => void }) {
  return <section className="goals-panel"><div className="section-heading"><div><h2>Your goals</h2><p>Keep them clear and connect tasks when you make a plan.</p></div><button className="add-button" onClick={openGoal}>＋ Add goal</button></div>{goals.length ? <div className="goal-grid">{goals.map((goal) => <article className={`goal-card ${goal.completed ? "goal-completed" : ""}`} key={goal.id}><div className="goal-card-heading"><input type="checkbox" checked={goal.completed} onChange={(event) => toggleGoal(goal, event.target.checked)} aria-label={goal.completed ? `Mark ${goal.title} in progress` : `Complete ${goal.title}`} /><span className="goal-spark" aria-hidden="true">✳</span></div><h3>{goal.title}</h3><p>Created {prettyDate(goal.createdAt.slice(0, 10), { day: "numeric", month: "short", year: "numeric" })}</p>{goal.endDate && <p className="goal-end-date">Due {prettyDate(goal.endDate, { day: "numeric", month: "short", year: "numeric" })}</p>}<button className="quiet-button" onClick={async () => { if (!window.confirm(`Delete the goal “${goal.title}”? Tasks linked to it will remain.`)) return; try { await deleteGoal(goal.id); window.sessionStorage.setItem("daymark-notice", "Goal deleted."); window.location.reload(); } catch { showMessage("The goal could not be deleted. Please try again."); } }}>Delete goal</button></article>)}</div> : <div className="empty-state"><div className="empty-illustration"><span aria-hidden="true">✳</span></div><h2>What matters to you?</h2><p>Goals give your tasks a little more meaning. Start with one thing you want to make progress on.</p><button className="add-button" onClick={openGoal}>＋ Add a goal</button></div>}</section>;
}
