# OpenTodo

A self-contained to-do list web app. No server, no build step, no accounts — open `index.html` and it runs entirely in your browser, storing data in `localStorage`.

## Features

| Requirement | How it works |
|---|---|
| **Enter things to be done** | `+ New task` with title, notes, priority, dates, recurrence, and subtasks. **Title and Due date are required.** |
| **Reminder the day prior** | Any task with a due date and reminders enabled surfaces in the 🔔 panel the day before (and the day of / when overdue). Click **Enable desktop alerts** to also get a browser notification the day before. |
| **Recurring events** | Set *Repeats* to daily / weekly / monthly / yearly. **Weekly** lets you pick specific weekdays (Monday-first). **Monthly** lets you pick specific days of the month and/or weekday positions (e.g. "2nd Tuesday", "last Friday") — the two can be combined, and the next occurrence is the earliest date matching any selected rule. The day-of-month picker only offers days that exist in the due date's month (you can't pick the 31st for a task due in a 30-day month). When the recurrence later lands on a shorter month, a day that doesn't exist there clamps to that month's last day (the 31st falls on Apr 30 / Feb 28, and on Feb 29 in a leap year). Completing the task spawns the next occurrence (dates and subtasks carried forward). |
| **Prioritize** | Four levels — Low, Medium, High, Critical — shown as a color stripe and used for sorting and the dashboard breakdown. |
| **Multi-day tasks** | Give a task both a start and due date; it renders as a `start → due` span. |
| **Monitor progression** | Per-task progress bars, a **Dashboard** with average progress / due-soon / overdue / completed counts, and subtasks that compute progress automatically. |
| **Kanban view** | The **Board** tab shows To Do / In Progress / Done columns with drag-and-drop between them. |
| **Records check-off time** | Completing a task stamps it; the **Completed** tab is a dated completion history. |

## Views

- **Dashboard** — stats, priority breakdown, and what's coming up.
- **List** — searchable, filterable, sortable list of active tasks.
- **Board** — Kanban board with drag-and-drop.
- **Completed** — chronological log of everything checked off, with timestamps.

## Running it

Just open the file:

```bash
# from the project directory
open index.html        # macOS
xdg-open index.html    # Linux
```

Or serve it (recommended so browser notifications behave consistently):

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Data & privacy

Everything is stored locally in your browser under the `opentodo.*` keys. Nothing leaves your machine. Clearing site data wipes your tasks, and data does not sync between browsers or devices.

## Notes / possible extensions

- Reminders are in-app plus optional desktop notifications while the tab is open. A future backend (Node + SQLite) could add real email/push reminders that fire even when the app is closed.
- No dependencies — plain HTML, CSS, and vanilla JavaScript.
