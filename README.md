# OpenTodo

A self-contained to-do list web app. No server, no build step, no accounts — open `index.html` and it runs entirely in your browser, storing data in `localStorage`.

## Features

| Requirement | How it works |
|---|---|
| **Enter things to be done** | `+ New task` with title, notes, priority, dates, recurrence, and subtasks. |
| **Reminder the day prior** | Any task with a due date and reminders enabled surfaces in the 🔔 panel the day before (and the day of / when overdue). Click **Enable desktop alerts** to also get a browser notification the day before. |
| **Recurring events** | Set *Repeats* to daily / weekly / monthly / yearly. Completing the task automatically spawns the next occurrence (dates and subtasks carried forward). |
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
