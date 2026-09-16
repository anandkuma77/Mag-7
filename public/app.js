/**
 * Mag 7 — frontend logic
 *
 * All state lives on the server (data.json). This file just fetches it,
 * renders it, and calls the API on every mutation (no client-side cache
 * pretending to be the source of truth).
 */

const API_BASE = "/api/tasks";
const SECTION_LIMITS = { blue: 3, green: 4 };

const el = {
  blueList: document.getElementById("blue-list"),
  greenList: document.getElementById("green-list"),
  blueCount: document.getElementById("blue-count"),
  greenCount: document.getElementById("green-count"),
  addBlueBtn: document.getElementById("add-blue-btn"),
  addGreenBtn: document.getElementById("add-green-btn"),
  boardCounter: document.getElementById("board-counter"),
  boardCountValue: document.getElementById("board-count-value"),
  emptyHint: document.getElementById("empty-hint"),
  fab: document.getElementById("fab-add"),
  toast: document.getElementById("toast"),

  modalBackdrop: document.getElementById("add-modal-backdrop"),
  modalClose: document.getElementById("modal-close"),
  modalCancel: document.getElementById("modal-cancel"),
  addForm: document.getElementById("add-form"),
  taskTextInput: document.getElementById("task-text-input"),
  taskSectionSelect: document.getElementById("task-section-select"),
  modalError: document.getElementById("modal-error"),
  modalFullWarning: document.getElementById("modal-full-warning"),
  modalSubmit: document.getElementById("modal-submit"),
};

let state = { tasks: [], meta: null };

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiRequest(url, options) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || "Request failed");
    err.code = body.code;
    err.status = res.status;
    throw err;
  }
  return body;
}

const api = {
  getAll: () => apiRequest(API_BASE),
  create: (text, section) =>
    apiRequest(API_BASE, { method: "POST", body: JSON.stringify({ text, section }) }),
  update: (id, patch) =>
    apiRequest(`${API_BASE}/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
  remove: (id) => apiRequest(`${API_BASE}/${id}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function showToast(message, isError = false) {
  el.toast.textContent = message;
  el.toast.classList.toggle("toast--error", isError);
  el.toast.hidden = false;
  requestAnimationFrame(() => el.toast.classList.add("show"));
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.toast.classList.remove("show");
    setTimeout(() => (el.toast.hidden = true), 200);
  }, 2600);
}

const STATE_LABELS = { ready: "Ready", running: "Run", done: "Done" };

function createStateToggle(task) {
  const group = document.createElement("div");
  group.className = "state-toggle";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Task stage");

  Object.keys(STATE_LABELS).forEach((s) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `state-toggle-btn state-toggle-btn--${s}`;
    btn.textContent = STATE_LABELS[s];
    btn.dataset.state = s;
    btn.setAttribute("aria-pressed", String(s === task.state));
    if (s === task.state) btn.classList.add("is-active");
    btn.addEventListener("click", () => {
      if (s === task.state) return; // already in this stage
      onStateChanged(task, s);
    });
    group.appendChild(btn);
  });

  return group;
}

function createTaskCard(task) {
  const card = document.createElement("div");
  card.className = `task-card state-${task.state}`;
  card.dataset.id = task.id;

  const main = document.createElement("div");
  main.className = "task-main";

  const text = document.createElement("div");
  text.className = "task-text";
  text.contentEditable = "true";
  text.spellcheck = false;
  text.textContent = task.text;
  text.addEventListener("blur", () => onTextEdited(task, text));
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      text.blur();
    }
  });

  const meta = document.createElement("div");
  meta.className = "task-meta";

  meta.appendChild(createStateToggle(task));
  main.appendChild(text);
  main.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "task-actions";

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-btn";
  deleteBtn.innerHTML = "&#10005;"; // ✕
  deleteBtn.title = "Delete task";
  deleteBtn.addEventListener("click", () => onDeleteTask(task));
  actions.appendChild(deleteBtn);

  card.appendChild(main);
  card.appendChild(actions);
  return card;
}

function createEmptySlot(section) {
  const slot = document.createElement("button");
  slot.className = "empty-slot";
  slot.textContent = "+ Add task";
  slot.addEventListener("click", () => openAddModal(section));
  return slot;
}

function render() {
  const tasks = state.tasks;
  const blueTasks = tasks.filter((t) => t.section === "blue");
  const greenTasks = tasks.filter((t) => t.section === "green");

  renderSection(el.blueList, blueTasks, SECTION_LIMITS.blue, "blue");
  renderSection(el.greenList, greenTasks, SECTION_LIMITS.green, "green");

  el.blueCount.textContent = `${blueTasks.length} / ${SECTION_LIMITS.blue}`;
  el.greenCount.textContent = `${greenTasks.length} / ${SECTION_LIMITS.green}`;

  el.addBlueBtn.disabled = blueTasks.length >= SECTION_LIMITS.blue;
  el.addGreenBtn.disabled = greenTasks.length >= SECTION_LIMITS.green;

  const total = tasks.length;
  el.boardCountValue.textContent = String(total);
  el.boardCounter.classList.toggle("is-full", total >= 7);

  const boardFull = total >= 7;
  el.fab.classList.toggle("is-disabled", boardFull);
  el.fab.title = boardFull
    ? "Board is full (7/7) — delete a task first"
    : "Add a task";

  el.emptyHint.hidden = total > 0;
}

function renderSection(listEl, tasks, limit, section) {
  listEl.innerHTML = "";
  tasks.forEach((task) => listEl.appendChild(createTaskCard(task)));

  const remaining = limit - tasks.length;
  for (let i = 0; i < remaining; i++) {
    listEl.appendChild(createEmptySlot(section));
  }
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadTasks() {
  try {
    const data = await api.getAll();
    state = data;
    render();
  } catch (err) {
    showToast("Failed to load tasks from server.", true);
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

async function onStateChanged(task, newState) {
  try {
    await api.update(task.id, { state: newState });
    await loadTasks();
  } catch (err) {
    showToast(err.message, true);
    await loadTasks(); // revert UI to server truth
  }
}

async function onTextEdited(task, textEl) {
  const newText = textEl.textContent.trim();
  if (!newText) {
    textEl.textContent = task.text; // don't allow empty text
    return;
  }
  if (newText === task.text) return;

  try {
    await api.update(task.id, { text: newText });
    await loadTasks();
  } catch (err) {
    showToast(err.message, true);
    textEl.textContent = task.text;
  }
}

async function onDeleteTask(task) {
  const confirmed = window.confirm(`Delete "${task.text}"?`);
  if (!confirmed) return;

  try {
    await api.remove(task.id);
    showToast("Task deleted — a slot just opened up.");
    await loadTasks();
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------------------------------------------------------------------------
// Add Task modal
// ---------------------------------------------------------------------------

function openAddModal(preferredSection) {
  const total = state.tasks.length;
  const blueFull = state.tasks.filter((t) => t.section === "blue").length >= SECTION_LIMITS.blue;
  const greenFull = state.tasks.filter((t) => t.section === "green").length >= SECTION_LIMITS.green;

  el.modalError.hidden = true;
  el.modalError.textContent = "";
  el.taskTextInput.value = "";

  const boardFull = total >= 7;
  el.modalFullWarning.hidden = !boardFull;
  el.modalSubmit.disabled = boardFull;

  // Configure section select: disable full sections, pick a sane default.
  Array.from(el.taskSectionSelect.options).forEach((opt) => {
    if (opt.value === "blue") opt.disabled = blueFull;
    if (opt.value === "green") opt.disabled = greenFull;
  });

  let defaultSection = preferredSection;
  if (defaultSection === "blue" && blueFull) defaultSection = greenFull ? "blue" : "green";
  if (defaultSection === "green" && greenFull) defaultSection = blueFull ? "green" : "blue";
  if (!defaultSection) defaultSection = blueFull ? "green" : "blue";
  el.taskSectionSelect.value = defaultSection;
  updateModalTheme();

  el.modalBackdrop.hidden = false;
  setTimeout(() => el.taskTextInput.focus(), 30);
}

// Recolor the modal to match whichever section is currently selected in the
// dropdown, so the "Add Task" popup always mirrors the section it targets.
function updateModalTheme() {
  const section = el.taskSectionSelect.value;
  el.modalBackdrop.classList.toggle("modal-theme-blue", section === "blue");
  el.modalBackdrop.classList.toggle("modal-theme-green", section === "green");
}

function closeAddModal() {
  el.modalBackdrop.hidden = true;
}

async function handleAddSubmit(e) {
  e.preventDefault();
  const text = el.taskTextInput.value.trim();
  const section = el.taskSectionSelect.value;

  el.modalError.hidden = true;

  if (!text) {
    el.modalError.textContent = "Please enter a task.";
    el.modalError.hidden = false;
    return;
  }

  try {
    el.modalSubmit.disabled = true;
    await api.create(text, section);
    closeAddModal();
    showToast(`Added to ${section.charAt(0).toUpperCase() + section.slice(1)} section.`);
    await loadTasks();
  } catch (err) {
    el.modalError.textContent = err.message;
    el.modalError.hidden = false;
  } finally {
    el.modalSubmit.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

el.fab.addEventListener("click", () => {
  if (state.tasks.length >= 7) {
    showToast("Board is full (7/7). Delete a task — try a Done one — first.", true);
    return;
  }
  openAddModal();
});

el.addBlueBtn.addEventListener("click", () => openAddModal("blue"));
el.addGreenBtn.addEventListener("click", () => openAddModal("green"));

el.modalClose.addEventListener("click", closeAddModal);
el.modalCancel.addEventListener("click", closeAddModal);
el.modalBackdrop.addEventListener("click", (e) => {
  if (e.target === el.modalBackdrop) closeAddModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !el.modalBackdrop.hidden) closeAddModal();
});

el.addForm.addEventListener("submit", handleAddSubmit);
el.taskSectionSelect.addEventListener("change", updateModalTheme);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

loadTasks();
