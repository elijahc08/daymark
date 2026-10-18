# Daymark

A small personal planner for tasks, goals, and dates. It is designed to run locally for one trusted user while you learn how a full-stack web app fits together.

## Start the app

Use Node.js 24 or newer and npm. (The selected recurrence library documents Node 20, 24, and 26 in its test matrix; Node 22 is installed in the current environment but is not listed there.) From this folder:

```sh
npm install
npm run db:migrate
npm run dev
```

Open the local address printed by Next.js. The SQLite database is created at `data/planner.sqlite`; that folder is ignored by Git, so your private task data is not committed. If you want a different database filename, set `DB_FILE_NAME` before running both the migration and app commands. The file is kept inside `data/`. `.env.example` shows the default value.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the local development server. |
| `npm run build` | Creates the production build. |
| `npm run start` | Serves a production build. |
| `npm run lint` | Checks source for common code and React issues. |
| `npm run typecheck` | Checks TypeScript types without creating output files. |
| `npm run db:generate` | Creates a SQL migration from schema changes. |
| `npm run db:migrate` | Applies pending migrations to the local database. |

When you change `src/db/schema.ts`, generate and apply a migration before relying on the changed database shape. Keep migration files in Git; do not commit the SQLite database.

## How it is put together

- **Next.js App Router + React + TypeScript** render the app and handle writes on the server. This avoids a second server to learn and maintain.
- **SQLite + Drizzle ORM** store tasks, goals, reusable routines, settings, and one-date exceptions. SQL migrations are in `drizzle/`.
- **Zod** checks submitted values on the server. The database path and connection stay in server-only code.
- **DayPicker** provides the keyboard-operable month grid. The task lists, agenda, navigation, dialogs, and styling are kept small and custom so they remain understandable.
- The interface has Dashboard, Today, Calendar, All tasks, Goals, and Routines. Save named routine templates with ordered tasks, then schedule them once or repeat them using the same recurrence rules as tasks. Use Shift+N or the visible Add task button to create a task.
- Calendar has Week, Month, and Year views. Week and Month show scheduled tasks on each date; Year summarizes tasks by month and places your saved goals beside the year overview. Goals are currently shared across years rather than assigned to a specific year.

## Repeating tasks: what to expect

The app supports every day, every week, every other week (choose two weeks), every N days, or chosen weekdays. A series can end on a date or after a number of occurrences. If neither is set, it continues indefinitely. The All tasks view starts with a 30-day range; change its From and Through fields to view another range, up to one year. Occurrences are only generated for the requested range.

The rule stores the task's local date and wall-clock time together with the saved IANA time zone. The recurrence library resolves those local times as dates cross daylight-saving changes. If a scheduled local time falls into a daylight-saving clock gap, that occurrence is omitted according to the library's RFC 5545 behavior. The app does not support monthly/yearly repeats, custom time-zone definitions, imported calendar rules, or arbitrary RRULE text. For a selected-weekday rule, the start date is also included as its first occurrence, even if it is not one of the selected weekdays.

Complete, skip, or edit one occurrence and the app stores an exception against that occurrence's original date. Moving an occurrence changes where it appears in the calendar while preserving the link to its original series date. Editing the series changes future rule data; deleting a series removes its occurrences and exceptions.

## Privacy and future hosting

There is no sign-in because this MVP assumes one trusted user on a private local machine. Do not expose this app on a public or shared server until authentication and per-user data permissions are added. The local SQLite file is not a production storage design for serverless hosting. No database secret is included in browser code.

For the architecture and research record, see [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md).

## Dependency audit

The runtime dependency audit reports zero known vulnerabilities. The full development dependency tree currently reports nine transitive advisories in lint and migration tooling (4 moderate, 5 high). npm offered fixes that would downgrade the framework lint configuration or migration tool to older major versions, so those were not applied. Recheck the audit when those tools release compatible updates.
