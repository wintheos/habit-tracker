// Модель данных:
//   Habit       { id, name, createdAt }              createdAt — "YYYY-MM-DD"
//   completions { [habitId]: ["YYYY-MM-DD", ...] }   отсортированные уникальные даты
//   state       { version, habits: Habit[], completions }

const STORAGE_KEY = "habit-tracker:v1";
const STATE_VERSION = 1;
const MAX_NAME_LENGTH = 60;

// ---------- Хранение ----------

function emptyState() {
  return { version: STATE_VERSION, habits: [], completions: {} };
}

// Читает состояние из localStorage. При пустом или повреждённом значении
// возвращает пустое состояние, не падая.
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.habits) || typeof data.completions !== "object") {
      return emptyState();
    }
    return { ...emptyState(), ...data };
  } catch (err) {
    console.warn("Не удалось прочитать данные, начинаю с пустых", err);
    return emptyState();
  }
}

// Возвращает true, если запись удалась.
function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error("Не удалось сохранить данные", err);
    return false;
  }
}

// Локальная дата в формате YYYY-MM-DD (без сдвига из-за UTC).
function toDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
}

// ---------- Операции над привычками ----------
// Меняют переданное состояние и возвращают результат; сохранение — на вызывающем.

function normalizeName(name) {
  return String(name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

// Возвращает новую привычку или null, если название пустое.
function addHabit(state, name) {
  const clean = normalizeName(name);
  if (!clean) return null;
  const habit = { id: newId(), name: clean, createdAt: toDateKey() };
  state.habits.push(habit);
  return habit;
}

// Возвращает true, если название изменилось.
function renameHabit(state, id, name) {
  const clean = normalizeName(name);
  const habit = state.habits.find((h) => h.id === id);
  if (!habit || !clean || habit.name === clean) return false;
  habit.name = clean;
  return true;
}

// Удаляет привычку вместе с её отметками. Возвращает true, если она была.
function deleteHabit(state, id) {
  const before = state.habits.length;
  state.habits = state.habits.filter((h) => h.id !== id);
  delete state.completions[id];
  return state.habits.length < before;
}

// ---------- Отметки и даты ----------

// Сдвиг даты "YYYY-MM-DD" на N дней (через локальный конструктор, без проблем с переводом часов).
function shiftDateKey(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  return toDateKey(new Date(y, m - 1, d + days));
}

function dateKeyToDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isDone(state, habitId, dateKey) {
  return (state.completions[habitId] || []).includes(dateKey);
}

// Ставит или снимает отметку. Возвращает новое значение (true — выполнено) или null, если привычки нет.
function toggleCompletion(state, habitId, dateKey) {
  if (!state.habits.some((h) => h.id === habitId)) return null;
  const dates = new Set(state.completions[habitId] || []);
  const done = !dates.has(dateKey);
  if (done) dates.add(dateKey);
  else dates.delete(dateKey);
  state.completions[habitId] = [...dates].sort();
  return done;
}

// ---------- Интерфейс ----------

function dayLabel(key, today) {
  if (key === today) return "Сегодня";
  if (key === shiftDateKey(today, -1)) return "Вчера";
  if (key === shiftDateKey(today, -2)) return "Позавчера";
  return "";
}

function initUI() {
  const state = load();
  const listEl = document.getElementById("habit-list");
  const prevEl = document.getElementById("day-prev");
  const nextEl = document.getElementById("day-next");
  const todayBtnEl = document.getElementById("day-today");
  const dayTitleEl = document.getElementById("day-title");
  const daySubEl = document.getElementById("day-sub");
  const progressEl = document.getElementById("day-progress");
  const statsEl = document.getElementById("stats");
  const statsHabitEl = document.getElementById("stats-habit");
  const calPrevEl = document.getElementById("cal-prev");
  const calNextEl = document.getElementById("cal-next");
  const calTitleEl = document.getElementById("cal-title");
  const calGridEl = document.getElementById("cal-grid");
  const summaryEl = document.getElementById("stats-summary");
  let selectedDate = toDateKey();
  const saveErrorEl = document.getElementById("save-error");
  let statsHabitId = null;
  let confirmingId = null;
  const now = new Date();
  let viewYear = now.getFullYear();
  let viewMonth = now.getMonth();
  const emptyEl = document.getElementById("empty");
  const formEl = document.getElementById("add-form");
  const inputEl = document.getElementById("add-input");
  let editingId = null;

  function commit() {
    saveErrorEl.hidden = save(state);
    render();
  }

  function button(label, className, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (className) b.className = className;
    b.addEventListener("click", onClick);
    return b;
  }

  function renderEditRow(habit, li) {
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = MAX_NAME_LENGTH;
    input.value = habit.name;
    input.setAttribute("aria-label", "Новое название привычки");

    const finish = (apply) => {
      if (editingId !== habit.id) return;
      editingId = null;
      if (apply && renameHabit(state, habit.id, input.value)) commit();
      else render();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(true);
      if (e.key === "Escape") finish(false);
    });

    li.append(
      input,
      button("Сохранить", "primary", () => finish(true)),
      button("Отмена", "", () => finish(false)),
    );
    queueMicrotask(() => { input.focus(); input.select(); });
  }

  function renderRow(habit) {
    const li = document.createElement("li");
    li.className = "habit";
    li.dataset.id = habit.id;

    if (editingId === habit.id) {
      renderEditRow(habit, li);
      return li;
    }

    // Подтверждение удаления встроено в строку: окна confirm() в просмотре артефакта нет.
    if (confirmingId === habit.id) {
      const question = document.createElement("span");
      question.className = "name";
      question.textContent = `Удалить «${habit.name}» вместе с историей?`;
      li.append(
        question,
        button("Удалить", "danger", () => {
          confirmingId = null;
          deleteHabit(state, habit.id);
          commit();
        }),
        button("Отмена", "", () => { confirmingId = null; render(); }),
      );
      return li;
    }

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = isDone(state, habit.id, selectedDate);
    check.addEventListener("change", () => {
      toggleCompletion(state, habit.id, selectedDate);
      commit();
    });

    const name = document.createElement("span");
    name.className = "name-text";
    name.textContent = habit.name;

    const streak = calcStreak(state.completions[habit.id] || [], toDateKey());
    const streakEl = document.createElement("span");
    streakEl.className = "streak";
    streakEl.textContent = streak.current ? `🔥 ${streak.current} дн.` : "";
    streakEl.title = `Текущая серия: ${streak.current} дн. Лучшая: ${streak.best} дн.`;

    const label = document.createElement("label");
    label.className = "name";
    label.append(check, name);
    li.classList.toggle("done", check.checked);

    li.append(
      label,
      streakEl,
      button("Переименовать", "", () => { editingId = habit.id; confirmingId = null; render(); }),
      button("Удалить", "danger", () => { confirmingId = habit.id; editingId = null; render(); }),
    );
    return li;
  }

  function renderDay() {
    const today = toDateKey();
    if (selectedDate > today) selectedDate = today;
    const date = dateKeyToDate(selectedDate);
    dayTitleEl.textContent = date.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
    daySubEl.textContent = dayLabel(selectedDate, today);
    nextEl.disabled = selectedDate >= today;
    todayBtnEl.hidden = selectedDate === today;
    const done = state.habits.filter((h) => isDone(state, h.id, selectedDate)).length;
    progressEl.textContent = state.habits.length ? `Выполнено: ${done} из ${state.habits.length}` : "";
  }

  function statItem(label, value) {
    const wrap = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    wrap.append(dt, dd);
    return wrap;
  }

  function renderStats() {
    statsEl.hidden = state.habits.length === 0;
    if (statsEl.hidden) return;

    if (!state.habits.some((h) => h.id === statsHabitId)) statsHabitId = state.habits[0].id;
    const habit = state.habits.find((h) => h.id === statsHabitId);
    const dates = state.completions[habit.id] || [];
    const today = toDateKey();

    statsHabitEl.replaceChildren(...state.habits.map((h) => {
      const opt = document.createElement("option");
      opt.value = h.id;
      opt.textContent = h.name;
      return opt;
    }));
    statsHabitEl.value = habit.id;

    const done = new Set(dates);
    calTitleEl.textContent = new Date(viewYear, viewMonth, 1)
      .toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    const cur = new Date();
    calNextEl.disabled = viewYear === cur.getFullYear() && viewMonth === cur.getMonth();

    const cells = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((w) => {
      const c = document.createElement("div");
      c.className = "cal-weekday";
      c.textContent = w;
      return c;
    });
    for (const week of monthGrid(viewYear, viewMonth)) {
      for (const cell of week) {
        const c = document.createElement("div");
        c.className = "cal-cell";
        c.textContent = Number(cell.key.slice(8));
        if (!cell.inMonth) c.classList.add("other");
        if (cell.key > today) c.classList.add("future");
        if (cell.key === today) c.classList.add("today");
        if (done.has(cell.key)) {
          c.classList.add("done");
          c.setAttribute("aria-label", `${cell.key}: выполнено`);
        }
        cells.push(c);
      }
    }
    calGridEl.replaceChildren(...cells);

    const w7 = completionRate(dates, habit.createdAt, today, 7);
    const w30 = completionRate(dates, habit.createdAt, today, 30);
    const streak = calcStreak(dates, today);
    summaryEl.replaceChildren(
      statItem("За 7 дней", `${w7.percent}% (${w7.done} из ${w7.total})`),
      statItem("За 30 дней", `${w30.percent}% (${w30.done} из ${w30.total})`),
      statItem("Всего отметок", String(totalDone(dates, today))),
      statItem("Лучшая серия", `${streak.best} дн.`),
    );
  }

  function render() {
    renderDay();
    listEl.replaceChildren(...state.habits.map(renderRow));
    emptyEl.hidden = state.habits.length > 0;
    renderStats();
  }

  statsHabitEl.addEventListener("change", () => { statsHabitId = statsHabitEl.value; render(); });
  calPrevEl.addEventListener("click", () => {
    viewMonth -= 1;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    render();
  });
  calNextEl.addEventListener("click", () => {
    viewMonth += 1;
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    render();
  });

  prevEl.addEventListener("click", () => { selectedDate = shiftDateKey(selectedDate, -1); render(); });
  nextEl.addEventListener("click", () => { selectedDate = shiftDateKey(selectedDate, 1); render(); });
  todayBtnEl.addEventListener("click", () => { selectedDate = toDateKey(); render(); });

  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    if (addHabit(state, inputEl.value)) {
      inputEl.value = "";
      commit();
    }
    inputEl.focus();
  });

  render();
}

if (typeof document !== "undefined") {
  // Для проверки из консоли браузера.
  window.HabitStore = {
    load, save, emptyState, toDateKey, newId, STORAGE_KEY,
    addHabit, renameHabit, deleteHabit, normalizeName,
    shiftDateKey, isDone, toggleCompletion,
  };
  initUI();
}

if (typeof module !== "undefined") {
  module.exports = {
    load, save, emptyState, toDateKey, newId, STORAGE_KEY,
    addHabit, renameHabit, deleteHabit, normalizeName,
    shiftDateKey, isDone, toggleCompletion,
  };
}
