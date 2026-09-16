# Mag 7

A strictly constrained daily goal tracker. The board holds a maximum of **7 tasks**, split across two sections:

-  **Green** — max 3 tasks
-  **Magenta** — max 4 tasks

Every task has a state: `ready` → `running` → `done`. The idea is to force focus by physically limiting how much you can put on your plate for the day.

## Tech stack

- **Backend:** Node.js + [Express](https://expressjs.com/)
- **Storage:** a local `data.json` file (no database required)
- **Frontend:** plain HTML/CSS/JS served as static assets from `public/`

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or later recommended)
- npm (comes bundled with Node.js)

## Running locally

1. **Clone or download this repository** and open a terminal in the project folder.

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Start the server:**

   ```bash
   npm start
   ```

   (or `npm run dev` — both run `node server.js`)

4. **Open the app** in your browser at:

   ```
   http://localhost:3000
   ```

   By default the server runs on port `3000`. You can override this with the `PORT` environment variable:

   ```bash
   PORT=4000 npm start
   ```

## Data persistence

Tasks are stored in `data.json` at the project root. This file is created automatically on first run if it doesn't already exist. Deleting it will reset your board.

## Project structure

```
.
├── server.js        # Express server & API routes (/api/tasks)
├── data.json         # Local JSON "database" for tasks
├── public/
│   ├── index.html     # App markup
│   ├── app.js          # Frontend logic (fetches/updates tasks via the API)
│   └── style.css       # Styling
├── package.json
└── package-lock.json
```

## API overview

| Method | Endpoint          | Description                                   |
| ------ | ----------------- | ---------------------------------------------- |
| GET    | `/api/tasks`      | List all tasks + section/board capacity meta   |
| POST   | `/api/tasks`      | Create a task (`{ text, section }`)            |
| PUT    | `/api/tasks/:id`  | Update a task (`text`, `state`, and/or `section`) |
| DELETE | `/api/tasks/:id`  | Delete a task                                  |

Server-side validation enforces the 7-task board limit and the per-section limits (3 Green / 4 Magenta), regardless of what the client sends.
