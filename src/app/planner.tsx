"use client";

import { DayPicker } from "@daypicker/react";
import "@daypicker/react/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createGoal, createTask, deleteGoal, deleteTask, getRange, saveOccurrence, saveSettings, setCompleted, skipOccurrence, updateTask } from "./actions";
import type { RepeatRule } from "@/src/db/schema";

type Item = { id: string; seriesId: string; originalDate: string; occurrenceDate: string; title: string; startTime: string; endTime: string; durationMinutes: number; completed: boolean; goalId: string | null; repeating: boolean };
type Goal = { id: string; title: string; createdAt: string; updatedAt: string };
type Series = { id: string; title: string; scheduledDate: string; startTime: string; endTime: string; durationMinutes: number; completed: boolean; goalId: string | null; recurrence: RepeatRule | null; createdAt: string; updatedAt: string };
type Initial = { today: string; month: string; timeZone: string; theme: "light" | "dark" | "system"; goals: Goal[]; items: Item[]; series: Series[]; goalNames: Record<string, string> };
type View = "Dashboard" | "Today" | "Calendar" | "All tasks" | "Goals";

const views: View[] = ["Dashboard", "Today", "Calendar", "All tasks", "Goals"];
const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const localDate = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
};
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (date: string, count: number) => {
  const value = localDate(date); value.setDate(value.getDate() + count); return dateKey(value);
};
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

export function Planner({ initial }: { initial: Initial }) {
  const [view, setView] = useState<View>("Today");
  const [items, setItems] = useState(initial.items);
  const [goals] = useState(initial.goals);
  const [month, setMonth] = useState(localDate(initial.month));
  const [selectedDate, setSelectedDate] = useState(initial.today);
  const [today] = useState(initial.today);
  const [allFrom, setAllFrom] = useState(initial.today);
  const [allThrough, setAllThrough] = useState(addDays(initial.today, 30));
  const [timeZone] = useState(initial.timeZone);
  const [theme] = useState(initial.theme);
  const [search, setSearch] = useState("");
  const [taskDialog, setTaskDialog] = useState<{ series?: Series; occurrence?: Item; date: string } | null>(null);
  const [goalDialog, setGoalDialog] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const dateFrom = view === "Today" ? today : view === "Calendar" ? monthBounds(month)[0] : view === "All tasks" ? allFrom : monthBounds(month)[0];
  const dateThrough = view === "Today" ? today : view === "Calendar" ? monthBounds(month)[1] : view === "All tasks" ? allThrough : monthBounds(month)[1];
  const invalidAllRange = !/^\d{4}-\d{2}-\d{2}$/.test(allFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(allThrough) || allFrom > allThrough || daysBetween(allFrom, allThrough) > 365;

  const refreshRange = useCallback(async (from = dateFrom, through = dateThrough) => {
    setItems(await getRange(from, through));
  }, [dateFrom, dateThrough]);

  useEffect(() => {
    let current = true;
    getRange(dateFrom, dateThrough).then((rows) => { if (current) setItems(rows); });
    return () => { current = false; };
  }, [dateFrom, dateThrough]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme === "system" ? "system" : theme;
  }, [theme]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setTaskDialog({ date: selectedDate || today });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedDate, today]);

  const visibleItems = useMemo(() => {
    const filtered = items.filter((item) => item.title.toLowerCase().includes(search.toLowerCase()));
    if (view === "Today") return filtered.filter((item) => item.occurrenceDate === today);
    if (view === "Calendar") return filtered.filter((item) => item.occurrenceDate === selectedDate);
    return filtered;
  }, [items, search, selectedDate, today, view]);
  const groupedItems = useMemo(() => visibleItems.reduce<Record<string, Item[]>>((groups, item) => {
    (groups[item.occurrenceDate] ??= []).push(item);
    return groups;
  }, {}), [visibleItems]);
  const selectedSeries = taskDialog?.series;
  const selectedOccurrence = taskDialog?.occurrence;

  function showMessage(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }

  async function handleTask(formData: FormData) {
    const result = selectedOccurrence?.repeating
      ? await saveOccurrence(selectedOccurrence.seriesId, selectedOccurrence.originalDate, formData)
      : selectedSeries
        ? await updateTask(selectedSeries.id, formData)
        : await createTask(formData);
    if (result?.error) return result.error;
    if (!selectedOccurrence?.repeating) {
      window.location.reload();
      return "";
    }
    setTaskDialog(null);
    await refreshRange();
    showMessage(selectedOccurrence ? "Occurrence updated." : selectedSeries ? "Task updated." : "Task added.");
    return "";
  }

  async function toggleComplete(item: Item) {
    await setCompleted(item.seriesId, item.originalDate, !item.completed);
    await refreshRange();
  }

  async function skip(item: Item) {
    if (!window.confirm(`Skip “${item.title}” on ${prettyDate(item.occurrenceDate)}?`)) return;
    await skipOccurrence(item.seriesId, item.originalDate);
    await refreshRange();
    showMessage("Occurrence skipped.");
  }

  function moveMonth(direction: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1, 12));
  }

  async function handleGoal(title: string) {
    const result = await createGoal(title);
    if (result?.error) return result.error;
    window.location.reload();
    return "";
  }

  async function handleSettings(zone: string, selectedTheme: "light" | "dark" | "system") {
    const result = await saveSettings(zone, selectedTheme);
    if (result?.error) return result.error;
    window.location.reload();
    return "";
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a href="#home" className="brand"><span className="brand-mark">d.</span><span>daymark</span></a>
      <div className="sidebar-caption">YOUR SPACE</div>
      <nav aria-label="Main navigation" className="main-nav">
        {views.map((name) => <button key={name} className={`nav-item ${view === name ? "active" : ""}`} onClick={() => setView(name)} aria-current={view === name ? "page" : undefined}>
          <span className={`nav-dot nav-dot-${name.toLowerCase().replace(" ", "-")}`} aria-hidden="true" />{name}
        </button>)}
      </nav>
      <div className="sidebar-bottom">
        <button className="nav-item settings-link" onClick={() => setSettingsOpen(true)}><span aria-hidden="true">⚙</span> Settings</button>
        <div className="profile-chip"><span className="avatar">E</span><span><strong>Personal</strong><small>Private planner</small></span></div>
      </div>
    </aside>

    <main className="main-content">
      <header className="topbar">
        <div className="mobile-brand"><span className="brand-mark">d.</span> daymark</div>
        <label className="search-box"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks" aria-label="Search tasks" /></label>
        <div className="top-actions"><button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings">⚙</button><button className="add-button" onClick={() => setTaskDialog({ date: selectedDate || today })}><span aria-hidden="true">＋</span> Add task <kbd>⌘ N</kbd></button></div>
      </header>
      <div className="page-body">
        <div className="page-heading">
          <div><p className="eyebrow">{view === "Today" ? "YOUR DAY" : view === "Dashboard" ? "A CLEAR VIEW OF WHAT MATTERS" : "YOUR PLANNER"}</p><h1>{view === "Today" ? "Today" : view}</h1><p className="page-subtitle">{view === "Today" ? prettyDate(today) : view === "Dashboard" ? "A little structure for the things you want to do." : view === "Calendar" ? new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(month) : view === "All tasks" ? "Your upcoming plans, grouped by day." : "Small steps toward what matters to you."}</p></div>
          {view === "Calendar" && <div className="month-actions"><button className="icon-button" onClick={() => moveMonth(-1)} aria-label="Previous month">‹</button><button className="today-button" onClick={() => { setMonth(localDate(today)); setSelectedDate(today); }}>Today</button><button className="icon-button" onClick={() => moveMonth(1)} aria-label="Next month">›</button></div>}
        </div>

        {view === "Dashboard" && <Dashboard items={items} goals={goals} today={today} setView={setView} />}
        {view === "Goals" && <GoalsPanel goals={goals} openGoal={() => setGoalDialog(true)} showMessage={showMessage} />}
        {view === "Calendar" && <div className="calendar-layout"><section className="calendar-card"><DayPicker mode="single" month={month} selected={localDate(selectedDate)} onSelect={(date) => date && setSelectedDate(dateKey(date))} onMonthChange={setMonth} fixedWeeks weekStartsOn={1} modifiers={{ hasTasks: items.map((item) => localDate(item.occurrenceDate)) }} modifiersClassNames={{ hasTasks: "has-task" }} aria-label="Calendar" /></section><section className="agenda-card"><div className="section-heading"><div><h2>{prettyDate(selectedDate, { weekday: "long", day: "numeric", month: "long" })}</h2><p>{visibleItems.length} {visibleItems.length === 1 ? "task" : "tasks"}</p></div><button className="text-button" onClick={() => setTaskDialog({ date: selectedDate })}>＋ Add</button></div><TaskList items={visibleItems} goalNames={initial.goalNames} onToggle={toggleComplete} onEdit={(item) => { const series = initial.series.find((row) => row.id === item.seriesId); if (series) setTaskDialog({ series, occurrence: item, date: item.occurrenceDate }); }} onEditSeries={(item) => { const series = initial.series.find((row) => row.id === item.seriesId); if (series) setTaskDialog({ series, date: item.occurrenceDate }); }} onSkip={skip} onDelete={async (item) => { if (!window.confirm(`Delete “${item.title}” and its entire series?`)) return; await deleteTask(item.seriesId); await refreshRange(); showMessage("Task deleted."); }} /></section></div>}
        {(view === "Today" || view === "All tasks") && <section className="list-panel">
          {view === "All tasks" && <div className="range-controls"><label>From<input type="date" value={allFrom} onChange={(event) => setAllFrom(event.target.value)} /></label><label>Through<input type="date" value={allThrough} onChange={(event) => setAllThrough(event.target.value)} /></label><span>{invalidAllRange ? "Choose an ordered date range of no more than one year." : "Repeating tasks are generated only for this range (up to one year)."}</span></div>}
          {invalidAllRange ? <div className="quiet small-empty">Update the date range to see tasks.</div> : Object.keys(groupedItems).length === 0 ? <EmptyState view={view} onAdd={() => setTaskDialog({ date: view === "Today" ? today : selectedDate })} /> : Object.entries(groupedItems).sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => <section className="day-group" key={date}><h2>{date === today ? "Today" : prettyDate(date)}</h2><TaskList items={rows} goalNames={initial.goalNames} onToggle={toggleComplete} onEdit={(item) => { const series = initial.series.find((row) => row.id === item.seriesId); if (series) setTaskDialog({ series, occurrence: item, date: item.occurrenceDate }); }} onEditSeries={(item) => { const series = initial.series.find((row) => row.id === item.seriesId); if (series) setTaskDialog({ series, date: item.occurrenceDate }); }} onSkip={skip} onDelete={async (item) => { if (!window.confirm(`Delete “${item.title}” and its entire series?`)) return; await deleteTask(item.seriesId); await refreshRange(); showMessage("Task deleted."); }} /></section>)}
        </section>}
      </div>
    </main>

    <nav className="mobile-nav" aria-label="Main navigation">{views.map((name) => <button key={name} className={view === name ? "active" : ""} onClick={() => setView(name)}>{name === "Dashboard" ? "Home" : name}</button>)}</nav>
    {notice && <div className="toast" role="status">{notice}</div>}
    {taskDialog && <TaskDialog key={`${selectedSeries?.id ?? "new"}-${selectedOccurrence?.occurrenceDate ?? "series"}`} series={selectedSeries} occurrence={selectedOccurrence} date={taskDialog.date} goals={goals} onClose={() => setTaskDialog(null)} onSubmit={handleTask} />}
    {goalDialog && <GoalDialog onClose={() => setGoalDialog(false)} onSubmit={handleGoal} />}
    {settingsOpen && <SettingsDialog timeZone={timeZone} theme={theme} onClose={() => setSettingsOpen(false)} onSubmit={handleSettings} />}
  </div>;
}

function Dashboard({ items, goals, today, setView }: { items: Item[]; goals: Goal[]; today: string; setView: (view: View) => void }) {
  const todayItems = items.filter((item) => item.occurrenceDate === today);
  const calendarItems = items.filter((item) => item.occurrenceDate >= today).slice(0, 4);
  return <div className="dashboard-grid">
    <section className="dashboard-card today-card"><div className="section-heading"><div><p className="eyebrow">TODAY</p><h2>{todayItems.length ? `${todayItems.length} scheduled` : "A little room to begin"}</h2></div><span className="summary-icon">☼</span></div>{todayItems.slice(0, 3).map((item) => <div className="mini-task" key={item.id}><span className={`mini-check ${item.completed ? "checked" : ""}`} /> <span>{item.title}</span><time>{item.startTime}</time></div>)}{!todayItems.length && <p className="quiet">Your day is open. Add something you want to make time for.</p>}<button className="card-link" onClick={() => setView("Today")}>Open today <span>→</span></button></section>
    <section className="dashboard-card goals-card"><div className="section-heading"><div><p className="eyebrow">GOALS</p><h2>Keep the bigger picture</h2></div><span className="summary-icon">✳</span></div>{goals.slice(0, 3).map((goal) => <div className="goal-line" key={goal.id}><span className="goal-spark">✳</span>{goal.title}</div>)}{goals.length === 0 && <p className="quiet">Add a goal, then link tasks to it when you plan your week.</p>}<button className="card-link" onClick={() => setView("Goals")}>View goals <span>→</span></button></section>
    <section className="dashboard-card calendar-preview"><div className="section-heading"><div><p className="eyebrow">UP NEXT</p><h2>Your calendar</h2></div><span className="summary-icon">▦</span></div>{calendarItems.map((item) => <div className="upcoming-line" key={item.id}><span className="upcoming-day">{prettyDate(item.occurrenceDate, { weekday: "short", day: "numeric" })}</span><span>{item.title}</span><time>{item.startTime}</time></div>)}{calendarItems.length === 0 && <p className="quiet">Your upcoming plans will show here.</p>}<button className="card-link" onClick={() => setView("Calendar")}>Open calendar <span>→</span></button></section>
  </div>;
}

function TaskList({ items, goalNames, onToggle, onEdit, onEditSeries, onSkip, onDelete }: { items: Item[]; goalNames: Record<string, string>; onToggle: (item: Item) => void; onEdit: (item: Item) => void; onEditSeries: (item: Item) => void; onSkip: (item: Item) => void; onDelete: (item: Item) => void }) {
  if (!items.length) return <div className="quiet small-empty">Nothing scheduled.</div>;
  return <div className="task-list">{items.map((item) => <article key={item.id} className={`task-row ${item.completed ? "completed" : ""}`}>
    <button className={`task-check ${item.completed ? "checked" : ""}`} onClick={() => onToggle(item)} aria-label={item.completed ? `Mark ${item.title} incomplete` : `Complete ${item.title}`} aria-pressed={item.completed}>{item.completed && <span aria-hidden="true">✓</span>}</button>
    <div className="task-copy"><strong>{item.title}</strong><div className="task-meta"><time>{item.startTime} – {item.endTime}</time>{goalNames[item.goalId ?? ""] && <span className="task-goal">{goalNames[item.goalId ?? ""]}</span>}{item.repeating && <span className="repeat-tag" title="Repeating task">↻</span>}</div></div>
    <div className="task-actions"><button onClick={() => onEdit(item)} title={item.repeating ? "Edit this occurrence" : "Edit task"}>Edit</button>{item.repeating && <button onClick={() => onEditSeries(item)} title="Edit every occurrence in this series">Series</button>}{item.repeating && <button onClick={() => onSkip(item)} title="Skip this occurrence">Skip</button>}<button onClick={() => onDelete(item)} title="Delete task or series">Delete</button></div>
  </article>)}</div>;
}

function EmptyState({ view, onAdd }: { view: View; onAdd: () => void }) {
  return <div className="empty-state"><div className="empty-illustration" aria-hidden="true">✳</div><h2>{view === "Today" ? "Make space for what matters" : "A fresh page"}</h2><p>{view === "Today" ? "Nothing is planned for today yet. Add a task and give it a time." : "No tasks in this range. A small plan is a good place to start."}</p><button className="add-button" onClick={onAdd}>＋ Add your first task</button></div>;
}

function TaskDialog({ series, occurrence, date, goals, onClose, onSubmit }: { series?: Series; occurrence?: Item; date: string; goals: Goal[]; onClose: () => void; onSubmit: (data: FormData) => Promise<string> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const startValue = occurrence?.startTime ?? series?.startTime ?? "09:00";
  const initialDuration = occurrence?.durationMinutes ?? series?.durationMinutes ?? 60;
  const [startTime, setStartTime] = useState(startValue);
  const [duration, setDuration] = useState(String(initialDuration));
  const [endTime, setEndTime] = useState(occurrence?.endTime ?? series?.endTime ?? addMinutesToTime(startValue, initialDuration));
  const recurrence = series?.recurrence;
  const isOccurrence = Boolean(occurrence?.repeating);
  const [repeatFrequency, setRepeatFrequency] = useState(recurrence?.frequency ?? "none");
  const [repeatInterval, setRepeatInterval] = useState(String(recurrence?.interval ?? 1));
  const [weekdays, setWeekdays] = useState<number[]>(recurrence?.weekdays ?? []);
  const [repeatEndDate, setRepeatEndDate] = useState(recurrence?.endDate ?? "");
  const [repeatCount, setRepeatCount] = useState(recurrence?.count?.toString() ?? "");

  useEffect(() => { ref.current?.showModal(); }, []);
  function changeStart(value: string) {
    setStartTime(value); setEndTime(addMinutesToTime(value, Number(duration)));
  }
  function changeDuration(value: string) {
    setDuration(value); setEndTime(addMinutesToTime(startTime, Number(value)));
  }
  async function submit(formData: FormData) {
    const message = await onSubmit(formData);
    setError(message);
  }
  const recurrenceJson = repeatFrequency === "none" ? "" : JSON.stringify({
    frequency: repeatFrequency,
    interval: Number(repeatInterval),
    weekdays,
    endDate: repeatEndDate || null,
    count: repeatCount ? Number(repeatCount) : null,
  });

  return <dialog ref={ref} className="modal" onCancel={onClose} onClick={(event) => { if (event.target === ref.current) onClose(); }}>
    <div className="modal-heading"><div><p className="eyebrow">{isOccurrence ? "ONE OCCURRENCE" : series ? "EDIT TASK SERIES" : "NEW TASK"}</p><h2>{isOccurrence ? "Change this occurrence" : series ? "Edit task" : "Plan a task"}</h2><p className="modal-subtitle">{isOccurrence ? "Your changes apply only to this date. The rest of the series stays the same." : "Give it a name and a time that feels right."}</p></div><button className="icon-button" onClick={onClose} aria-label="Close form">×</button></div>
    <form action={submit} className="task-form">
      <label className="field full-width">Task title<input name="title" maxLength={160} required defaultValue={occurrence?.title ?? series?.title ?? ""} placeholder="What would you like to do?" autoFocus /></label>
      <label className="field">Date<input name="scheduledDate" type="date" required defaultValue={occurrence ? occurrence.occurrenceDate : series?.scheduledDate ?? date} /></label>
      <label className="field">Start time<input name="startTime" type="time" required value={startTime} onChange={(event) => changeStart(event.target.value)} /></label>
      <div className="field"><label htmlFor="task-end">End time</label><input id="task-end" name="endTime" type="time" required value={endTime} onChange={(event) => { setEndTime(event.target.value); const [h1,m1]=startTime.split(":").map(Number); const [h2,m2]=event.target.value.split(":").map(Number); setDuration(String(h2*60+m2-(h1*60+m1))); }} /></div>
      <label className="field">Duration (minutes)<input name="durationMinutes" type="number" min="1" max="1439" required value={duration} onChange={(event) => changeDuration(event.target.value)} /></label>
      <label className="field full-width">Link to a goal <select name="goalId" defaultValue={series?.goalId ?? ""}><option value="">No goal</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label>
      {!isOccurrence && <>
        <label className="field full-width">Repeat<select name="repeatFrequency" value={repeatFrequency} onChange={(event) => setRepeatFrequency(event.target.value as typeof repeatFrequency)}><option value="none">Does not repeat</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="every-n-days">Every N days</option><option value="weekdays">Selected weekdays</option></select></label>
        {repeatFrequency !== "none" && <>
          {(repeatFrequency === "every-n-days" || repeatFrequency === "weekly") && <label className="field">{repeatFrequency === "weekly" ? "Repeat every (weeks)" : "Repeat every (days)"}<input id="repeat-interval" name="repeatInterval" type="number" min="1" max="365" value={repeatInterval} onChange={(event) => setRepeatInterval(event.target.value)} /></label>}
          {repeatFrequency === "weekdays" && <fieldset className="weekday-field full-width"><legend>Repeat on</legend><div className="weekday-options">{weekdayNames.map((name, index) => <label key={name}><input type="checkbox" name="weekdays" value={index} checked={weekdays.includes(index)} onChange={(event) => setWeekdays((value) => event.target.checked ? [...value, index].sort() : value.filter((day) => day !== index))} /><span>{name.slice(0, 2)}</span></label>)}</div></fieldset>}
          <label className="field">End after date<input name="repeatEndDate" type="date" min={date} value={repeatEndDate} onChange={(event) => { setRepeatEndDate(event.target.value); if (event.target.value) setRepeatCount(""); }} /></label>
          <label className="field">Or after occurrences<input name="repeatCount" type="number" min="1" max="10000" placeholder="No end" value={repeatCount} onChange={(event) => { setRepeatCount(event.target.value); if (event.target.value) setRepeatEndDate(""); }} /></label>
        </>}
      </>}
      {series && !isOccurrence && <input type="hidden" name="recurrenceJson" value={recurrenceJson} />}
      {error && <p className="form-error full-width" role="alert">{error}</p>}
      <div className="form-actions full-width"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="add-button" type="submit">{isOccurrence ? "Save this occurrence" : "Save task"}</button></div>
    </form>
  </dialog>;
}

function GoalDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (title: string) => Promise<string> }) {
  const [error, setError] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="modal modal-small" onCancel={onClose}><div className="modal-heading"><div><p className="eyebrow">AIM WITH INTENTION</p><h2>Add a goal</h2></div><button className="icon-button" onClick={onClose} aria-label="Close form">×</button></div><form action={async (data) => { const message = await onSubmit(String(data.get("title") ?? "")); setError(message); }} className="task-form"><label className="field full-width">Goal name<input name="title" required maxLength={120} placeholder="What matters to you?" autoFocus /></label>{error && <p role="alert" className="form-error full-width">{error}</p>}<div className="form-actions full-width"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="add-button">Save goal</button></div></form></dialog>;
}

function SettingsDialog({ timeZone, theme, onClose, onSubmit }: { timeZone: string; theme: "light" | "dark" | "system"; onClose: () => void; onSubmit: (zone: string, theme: "light" | "dark" | "system") => Promise<string> }) {
  const [zone, setZone] = useState(timeZone);
  const [selectedTheme, setSelectedTheme] = useState(theme);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="modal modal-small" onCancel={onClose}><div className="modal-heading"><div><p className="eyebrow">MAKE IT YOURS</p><h2>Settings</h2></div><button className="icon-button" onClick={onClose} aria-label="Close settings">×</button></div><form action={async (data) => { const message = await onSubmit(String(data.get("timeZone") ?? zone), String(data.get("theme") ?? selectedTheme) as typeof theme); setError(message); }} className="task-form"><label className="field full-width">Time zone<input name="timeZone" value={zone} onChange={(event) => setZone(event.target.value)} placeholder="Europe/London" required /><small>Use an IANA time zone such as Europe/London or America/New_York.</small></label><label className="field full-width">Appearance<select name="theme" value={selectedTheme} onChange={(event) => setSelectedTheme(event.target.value as typeof theme)}><option value="system">Use device setting</option><option value="light">Light</option><option value="dark">Dark</option></select></label>{error && <p role="alert" className="form-error full-width">{error}</p>}<div className="form-actions full-width"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="add-button">Save settings</button></div></form></dialog>;
}

function GoalsPanel({ goals, openGoal, showMessage }: { goals: Goal[]; openGoal: () => void; showMessage: (message: string) => void }) {
  return <section className="goals-panel"><div className="section-heading"><div><h2>Your goals</h2><p>Keep them clear and connect tasks when you make a plan.</p></div><button className="add-button" onClick={openGoal}>＋ Add goal</button></div>{goals.length ? <div className="goal-grid">{goals.map((goal) => <article className="goal-card" key={goal.id}><span className="goal-spark">✳</span><h3>{goal.title}</h3><p>Created {prettyDate(goal.createdAt.slice(0, 10), { day: "numeric", month: "short", year: "numeric" })}</p><button className="quiet-button" onClick={async () => { if (!window.confirm(`Delete the goal “${goal.title}”? Tasks linked to it will remain.`)) return; await deleteGoal(goal.id); window.location.reload(); showMessage("Goal deleted."); }}>Delete goal</button></article>)}</div> : <div className="empty-state"><div className="empty-illustration" aria-hidden="true">✳</div><h2>What matters to you?</h2><p>Goals give your tasks a little more meaning. Start with one thing you want to make progress on.</p><button className="add-button" onClick={openGoal}>＋ Add a goal</button></div>}</section>;
}
