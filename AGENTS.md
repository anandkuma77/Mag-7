# AGENTS.md — guide for AI coding agents working on Rocket 7

This file is for AI agents (and future-you). It captures the project's
purpose, the non-obvious naming quirks, and the invariants that must not
break. Read this before editing anything.

## What this app is

**Rocket 7** is a local, single-user daily goal tracker. The entire premise is a
hard constraint: **the board can never hold more than 7 tasks**, split into
two fixed-size sections. There is no auth, no database, no multi-user
support — it's intentionally tiny.

## Tech stack

- **Backend:** Node.js + Express (`server.js`), single file, no framework beyond Express.
- **Storage:** `data.json` at the repo root, read/written with the native `fs` module. No database.
- **Frontend:** vanilla HTML/CSS/JS in `public/` — no build step, no framework, no bundler.
- **Run it:** `npm install && npm start` (or `npm run dev`), then open `http://localhost:3000`. Port is overridable via `PORT`.

## File map

| File | Role |
|---|---|
| `server.js` | Express app + all `/api/tasks` CRUD routes + `POST /api/save-snapshot` + server-side limit enforcement |
| `data.json` | The only "database" — holds both live task state (`tasks` array) **and** the append-only snapshot history (`snapshots` array, written only by the "Save" FAB). **Gitignored** — see Data rules below |
| `public/index.html` | Static markup: two sections, the Add-Task modal, the Pomodoro panel, the "Save" FAB, the pixel-art rocket ship |
| `public/app.js` | All frontend logic: rendering, `fetch()` calls to the API, the Pomodoro timer, modal theming, snapshot saving |
| `public/style.css` | All styling — currently a neon "JDM digital dashboard" theme (see Theming below) |
| `README.md` | User-facing setup docs |

## Section naming (fixed 2026-09-17 — no more blue/green quirk)

The two task sections' internal keys now match their visual names/colors
directly. There used to be a historical mismatch (internal `"blue"` was
visually green, internal `"green"` was visually magenta) — that's been
fully renamed across `server.js`, `data.json`, the snapshot schema,
`public/index.html`, `public/app.js`, and `public/style.css`.
**Do not reintroduce the old `"blue"`/`"green"` keys.**

| Internal key (`section` field, HTML id prefixes) | Task limit | Display name | Color |
|---|---|---|---|
| `"green"` | 3 | "Sector I — Nitro Green" | neon green (`--green` CSS var) |
| `"magenta"` | 4 | "Sector II — Voltex Magenta" | magenta (`--magenta` CSS var) |

If you ever see `"blue"` as a `section` value or `--blue`/`el.blueX`/
`*-blue`/`*-green`(as a *key*, not the new green-as-Sector-I) anywhere, it's
stale — from before the rename or from restoring an old `data.json` backup.
Migrate any such data with `blue -> green`, `green -> magenta`.

## Hard invariants (enforced server-side in `server.js`, mirror in UI)

```js
const SECTION_LIMITS = { green: 3, magenta: 4 };   // 3 + 4 = 7 total, always
const VALID_STATES = ["ready", "running", "done"];
```

- Board never exceeds 7 tasks total (`409 BOARD_FULL` if you try).
- A section never exceeds its limit (`409 SECTION_FULL` if you try).
- Every task has exactly one `state`: `ready` | `running` | `done`.
- These checks live in `server.js` and are re-validated there even though the
  frontend also disables buttons/options proactively — never remove the
  server-side checks in favor of only client-side ones.

## Frontend architecture notes

- `app.js` is a **classic (non-module) script** — top-level `function`
  declarations attach to `window` (useful for debugging via
  `page.evaluate`/devtools); top-level `let`/`const` do not.
- Rendering is a full re-render from server state after every mutation
  (`loadTasks()` → `render()`), not optimistic local patching. Keep this
  pattern for new features unless there's a good reason not to.
- The DOM elements `app.js` creates dynamically use **fixed class names**
  (`task-card`, `state-toggle`, `state-toggle-btn--{ready,running,done}`,
  `empty-slot`, etc.). CSS reskins must target these exact classes — don't
  rename them without updating `app.js` too.
- Static IDs in `index.html` that `app.js` looks up via `getElementById` must
  never be removed/renamed without a matching `app.js` change: `green-list`,
  `magenta-list`, `green-count`, `magenta-count`, `add-green-btn`,
  `add-magenta-btn`, `board-counter`, `board-count-value`, `fab-save`, `toast`,
  `add-modal-backdrop`, `modal-title`, `modal-close`, `add-form`,
  `task-text-input`, `task-section-select`, `modal-error`,
  `modal-full-warning`, `modal-cancel`, `modal-submit`,
  `pomodoro-panel`, `pomodoro-mode`, `pomodoro-time`, `pomodoro-toggle`,
  `pomodoro-reset`, `pomodoro-sessions`.
- **`fab-save` (bottom-right FAB) no longer opens the Add-Task modal** — as
  of the snapshot-logging feature, it POSTs to `/api/save-snapshot` instead.
  Tasks are still added via the per-section `add-green-btn`/`add-magenta-btn`
  buttons and the `.empty-slot` buttons rendered in each section. If you're
  looking for "how does the FAB add a task" behavior from older history,
  that's gone by design — confirm with the user before reintroducing it.
- **Known CSS trap:** an element hidden via the `hidden` attribute stays
  hidden only if no CSS rule sets `display` on it without a `[hidden]`
  override. If you give a hideable element (modal, panel, etc.) `display:
  flex/grid/block` in a rule, always add a matching `.your-class[hidden] {
  display: none; }` — this exact bug broke the Add-Task modal once.
- **Disabled buttons don't fire `click` handlers** (including via
  `element.click()` in tests) — this is expected, not a bug, when a section
  is full.

## Theming

The whole visual theme is CSS-variable-driven from `:root` in `style.css`
(currently a neon JDM/Kanjozoku palette: Nitro Green `--green`, Voltex Magenta
`--magenta`, Boost Pink `--running`, Podium Gold `--done`). To retheme:

1. Change the hex values in `:root` — most of the UI will follow automatically.
2. Check for **hardcoded colors that bypass the variables** before assuming a
   var-only change is enough (e.g. the FAB gradient, the pixel-art fill
   classes `.ps-w/.ps-r/.ps-b`, `.modal-full-warning`'s text color) — these
   were deliberately hardcoded and won't move with the variables.
3. The Add-Task modal recolors dynamically based on the selected section via
   `.modal-theme-green` / `.modal-theme-magenta` classes toggled by
   `updateModalTheme()` in `app.js` — don't reintroduce a single hardcoded
   modal color.
4. There's a decorative inline-SVG pixel-art rocket ship
   (`.pixel-showcase`/`.pixel-art`/`.ps-*`) below the two sections, and a CRT
   scanline overlay (`.crt-overlay`) — both purely decorative, safe to
   restyle or remove without touching functionality.

## Pomodoro timer

Fully client-side (`app.js`, `~POMODORO_*` constants + functions), persisted
via `localStorage` (`rocket7-pomodoro-v1`, with one-time migration from `mag7-pomodoro-v1`), **not** part of `data.json` or the
server API. 25 min work / 5 min break / 15 min long break every 4th session.
Session count resets on a new calendar day. If asked to change durations or
persistence, this is self-contained — no backend involvement needed.

## Productivity snapshots ("Save" FAB)

- The bottom-right FAB (`#fab-save`, class `.fab`) is labeled "Save". Clicking
  it calls `onSaveSnapshot()` in `app.js`, which captures the client-side
  click timestamp, `POST`s to `/api/save-snapshot`, and shows a "Snapshot
  Saved." toast + a brief `.is-saved` glow on success.
- **The server route appends one entry to the `snapshots` array inside
  `data.json` itself** (alongside the existing `tasks` array) — there is no
  separate log file. `data.json` therefore has this shape:
  ```json
  {
    "tasks": [ /* live board state, unchanged from before */ ],
    "snapshots": [
      {
        "timestamp": "2026-09-17T18:00:00.000Z",
        "green_tasks": [{ "id": "...", "text": "...", "state": "Ready" }],
        "magenta_tasks": [{ "id": "...", "text": "...", "state": "Running" }]
      }
    ]
  }
  ```
- **Only `POST /api/save-snapshot` ever writes to the `snapshots` array.**
  The `/api/tasks` CRUD routes (`GET`/`POST`/`PUT`/`DELETE`) only ever touch
  `tasks` and always round-trip `snapshots` unchanged (via `readData()` →
  mutate `data.tasks` → `writeData(data)`, where `data` still carries the
  `snapshots` key it was read with). **Do not add any snapshot-array writes
  to the CRUD routes, and do not make `/api/save-snapshot` touch `tasks`.**
  Clicking "Save" N times must produce exactly N new entries in `snapshots`
  — nothing more, nothing less — and normal task edits must never add a
  snapshot entry.
- The schema uses the *visual* section names, which now match the internal
  keys 1:1 (see "Section naming" above):
  - `green_tasks` is populated from the internal `"green"` section
    (Sector I — Nitro Green).
  - `magenta_tasks` is populated from the internal `"magenta"` section
    (Sector II — Voltex Magenta).
  - This mapping lives in `toSnapshotTask`/the `/api/save-snapshot` handler
    in `server.js`.
- `readData()` defaults `snapshots` to `[]` if it's missing or malformed
  (e.g. an older `data.json` from before this feature existed), so it's
  always safe to `.push()` onto `data.snapshots`.

## Data rules — important

- `data.json` is in `.gitignore` **on purpose** — it holds the user's real,
  live daily tasks *and* real historical snapshots, not sample data. It is
  not committed.
- When testing CRUD behavior (via `curl` or a browser automation script),
  **do not leave test tasks behind.** Prefer: capture current state → create
  temp task(s) → verify → `DELETE` them by id → confirm `data.json` matches
  what it was before. Never blanket-overwrite `data.json` while the app is
  live; the user may be actively using it in their own browser tab
  concurrently (this has happened during real sessions).
- **Same rule applies to the `snapshots` array**: when testing
  `/api/save-snapshot` (directly or via clicking the FAB in an automated
  browser), remove any test-generated entries from `data.json`'s
  `snapshots` array afterward, leaving the user's real entries untouched —
  identify test entries by their timestamp rather than truncating the
  whole array.
- There's no seed/reset script. If `data.json` is missing, `server.js`
  starts it as `{ tasks: [], snapshots: [] }` automatically.

## Verifying UI changes

There's no automated test suite. The established pattern in this repo's
history is: run the server, use headless Chrome
(`google-chrome --headless=new --no-sandbox --screenshot=...`) or Puppeteer
for anything requiring clicks/interaction, and visually inspect the
screenshot. Clean up any temp files/tasks afterward.

## Git

- Remote: `origin` → `git@github.com:anandkuma77/Mag-7.git`, branch `main`.
- `node_modules/`, `*.log`, `.DS_Store`, and `data.json` are gitignored.
- No CI configured — commits go straight to `main`.
