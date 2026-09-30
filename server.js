/**
 * Rocket 7 — server.js
 *
 * A tiny Express backend that persists tasks to a local data.json file
 * using the native `fs` module (no database).
 *
 * Rules enforced server-side (never trust the client alone):
 *  - Board is capped at 7 tasks total.
 *  - "blue" section is capped at 3 tasks.
 *  - "green" section is capped at 4 tasks.
 *  - Every task has a `state` of "ready" | "running" | "done".
 *
 * The GTD Inbox (`/api/gtd`) is a separate, UNLIMITED capture list stored
 * alongside tasks in data.json — it's deliberately exempt from the 7-task
 * cap. Items only touch the cap when explicitly "promoted" onto the board
 * via POST /api/gtd/:id/promote, which re-runs the same board/section
 * checks as creating a task normally.
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");

const SECTION_LIMITS = { blue: 3, green: 4 };
const VALID_SECTIONS = Object.keys(SECTION_LIMITS); // ['blue', 'green']
const VALID_STATES = ["ready", "running", "done"];
const MAX_TASKS = Object.values(SECTION_LIMITS).reduce((a, b) => a + b, 0); // 7

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------------------
// Storage helpers (synchronous fs — fine for a single-user local app)
// ---------------------------------------------------------------------------

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tasks)) return { tasks: [], gtd: [] };
    if (!Array.isArray(parsed.gtd)) parsed.gtd = [];
    return parsed;
  } catch (err) {
    // File missing or corrupt — start fresh rather than crash the app.
    return { tasks: [], gtd: [] };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function countBySection(tasks, section) {
  return tasks.filter((t) => t.section === section).length;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// READ — all tasks, plus derived metadata the frontend needs to render
// section capacities and the +Button enabled/disabled state.
app.get("/api/tasks", (req, res) => {
  const data = readData();
  const blueCount = countBySection(data.tasks, "blue");
  const greenCount = countBySection(data.tasks, "green");

  res.json({
    tasks: data.tasks,
    meta: {
      total: data.tasks.length,
      maxTasks: MAX_TASKS,
      sections: {
        blue: { count: blueCount, limit: SECTION_LIMITS.blue, full: blueCount >= SECTION_LIMITS.blue },
        green: { count: greenCount, limit: SECTION_LIMITS.green, full: greenCount >= SECTION_LIMITS.green },
      },
      boardFull: data.tasks.length >= MAX_TASKS,
    },
  });
});

// CREATE — add a new task to a section, respecting the strict limits.
app.post("/api/tasks", (req, res) => {
  const { text, section } = req.body || {};

  if (typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "Task text is required." });
  }
  if (!VALID_SECTIONS.includes(section)) {
    return res.status(400).json({ error: `Section must be one of: ${VALID_SECTIONS.join(", ")}` });
  }

  const data = readData();

  if (data.tasks.length >= MAX_TASKS) {
    return res.status(409).json({
      error: "Rocket 7 board is full (7/7). Delete an existing task — ideally a Done one — before adding another.",
      code: "BOARD_FULL",
    });
  }

  const currentSectionCount = countBySection(data.tasks, section);
  if (currentSectionCount >= SECTION_LIMITS[section]) {
    return res.status(409).json({
      error: `The ${section} section is full (${SECTION_LIMITS[section]}/${SECTION_LIMITS[section]}). Delete a task from that section first.`,
      code: "SECTION_FULL",
    });
  }

  const newTask = {
    id: crypto.randomUUID(),
    text: text.trim(),
    section,
    state: "ready",
    createdAt: new Date().toISOString(),
  };

  data.tasks.push(newTask);
  writeData(data);

  res.status(201).json(newTask);
});

// UPDATE — edit task text and/or state.
app.put("/api/tasks/:id", (req, res) => {
  const { id } = req.params;
  const { text, state, section } = req.body || {};

  const data = readData();
  const task = data.tasks.find((t) => t.id === id);
  if (!task) {
    return res.status(404).json({ error: "Task not found." });
  }

  if (text !== undefined) {
    if (typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Task text cannot be empty." });
    }
    task.text = text.trim();
  }

  if (state !== undefined) {
    if (!VALID_STATES.includes(state)) {
      return res.status(400).json({ error: `State must be one of: ${VALID_STATES.join(", ")}` });
    }
    task.state = state;
  }

  if (section !== undefined && section !== task.section) {
    if (!VALID_SECTIONS.includes(section)) {
      return res.status(400).json({ error: `Section must be one of: ${VALID_SECTIONS.join(", ")}` });
    }
    const destinationCount = countBySection(data.tasks, section);
    if (destinationCount >= SECTION_LIMITS[section]) {
      return res.status(409).json({
        error: `Cannot move task — the ${section} section is already full.`,
        code: "SECTION_FULL",
      });
    }
    task.section = section;
  }

  writeData(data);
  res.json(task);
});

// DELETE — remove a task, freeing up a slot.
app.delete("/api/tasks/:id", (req, res) => {
  const { id } = req.params;
  const data = readData();
  const index = data.tasks.findIndex((t) => t.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Task not found." });
  }

  const [removed] = data.tasks.splice(index, 1);
  writeData(data);

  res.json({ deleted: removed });
});

// ---------------------------------------------------------------------------
// GTD Inbox — an unlimited capture list, deliberately EXEMPT from the
// 7-task board cap. It's a holding area for stray thoughts/tasks before
// they're triaged ("promoted") into the Blue or Green board sections
// (which still enforce SECTION_LIMITS / MAX_TASKS on promotion).
// ---------------------------------------------------------------------------

// READ — all GTD inbox items.
app.get("/api/gtd", (req, res) => {
  const data = readData();
  res.json({ items: data.gtd });
});

// CREATE — capture a new inbox item. No limit.
app.post("/api/gtd", (req, res) => {
  const { text } = req.body || {};

  if (typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "Item text is required." });
  }

  const data = readData();

  const newItem = {
    id: crypto.randomUUID(),
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };

  data.gtd.push(newItem);
  writeData(data);

  res.status(201).json(newItem);
});

// UPDATE — edit inbox item text.
app.put("/api/gtd/:id", (req, res) => {
  const { id } = req.params;
  const { text } = req.body || {};

  const data = readData();
  const item = data.gtd.find((i) => i.id === id);
  if (!item) {
    return res.status(404).json({ error: "Inbox item not found." });
  }

  if (typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "Item text cannot be empty." });
  }
  item.text = text.trim();

  writeData(data);
  res.json(item);
});

// DELETE — discard an inbox item.
app.delete("/api/gtd/:id", (req, res) => {
  const { id } = req.params;
  const data = readData();
  const index = data.gtd.findIndex((i) => i.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Inbox item not found." });
  }

  const [removed] = data.gtd.splice(index, 1);
  writeData(data);

  res.json({ deleted: removed });
});

// PROMOTE — move an inbox item onto the board as a real task. Still
// re-validates the board/section caps here, same as POST /api/tasks.
app.post("/api/gtd/:id/promote", (req, res) => {
  const { id } = req.params;
  const { section } = req.body || {};

  if (!VALID_SECTIONS.includes(section)) {
    return res.status(400).json({ error: `Section must be one of: ${VALID_SECTIONS.join(", ")}` });
  }

  const data = readData();
  const itemIndex = data.gtd.findIndex((i) => i.id === id);
  if (itemIndex === -1) {
    return res.status(404).json({ error: "Inbox item not found." });
  }

  if (data.tasks.length >= MAX_TASKS) {
    return res.status(409).json({
      error: "Rocket 7 board is full (7/7). Delete an existing task before promoting this item.",
      code: "BOARD_FULL",
    });
  }

  const currentSectionCount = countBySection(data.tasks, section);
  if (currentSectionCount >= SECTION_LIMITS[section]) {
    return res.status(409).json({
      error: `The ${section} section is full (${SECTION_LIMITS[section]}/${SECTION_LIMITS[section]}). Delete a task from that section first.`,
      code: "SECTION_FULL",
    });
  }

  const [item] = data.gtd.splice(itemIndex, 1);

  const newTask = {
    id: crypto.randomUUID(),
    text: item.text,
    section,
    state: "ready",
    createdAt: new Date().toISOString(),
  };

  data.tasks.push(newTask);
  writeData(data);

  res.status(201).json(newTask);
});

// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Rocket 7 running at http://localhost:${PORT}`);
});
