// Календарь и статистика. Чистая логика без DOM.
// Требует streak.js (функция dayNumber), подключать после него.

function formatKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Сетка месяца для календаря с понедельника: массив недель по 7 ячеек { key, inMonth }.
// month — 0..11. Недели добиваются днями соседних месяцев (inMonth: false).
function monthGrid(year, month) {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  const result = [];
  for (let w = 0; w < weeks; w++) {
    const row = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(year, month, 1 - offset + w * 7 + i);
      row.push({ key: formatKey(date), inMonth: date.getMonth() === month });
    }
    result.push(row);
  }
  return result;
}

// Выполнение за последние windowDays дней, включая сегодня.
// Считаем только с того дня, когда привычка «началась» (createdAt или первая отметка, что раньше),
// чтобы новая привычка не получала штраф за дни, которых у неё ещё не было.
// Возвращает { done, total, percent }.
function completionRate(dates, createdAt, today, windowDays) {
  const todayN = dayNumber(today);
  const done = [...new Set(dates.map(dayNumber))].filter((n) => n <= todayN);
  const windowStart = todayN - (windowDays - 1);
  const habitStart = Math.min(dayNumber(createdAt), ...done);
  const start = Math.max(windowStart, habitStart);
  const total = Math.max(0, todayN - start + 1);
  const count = done.filter((n) => n >= start).length;
  return { done: count, total, percent: total ? Math.round((count / total) * 100) : 0 };
}

// Всего уникальных отметок (будущие даты не считаются).
function totalDone(dates, today) {
  const todayN = dayNumber(today);
  return new Set(dates.map(dayNumber).filter((n) => n <= todayN)).size;
}

if (typeof window !== "undefined") Object.assign(window, { monthGrid, completionRate, totalDone });
if (typeof module !== "undefined") module.exports = { monthGrid, completionRate, totalDone, formatKey };
