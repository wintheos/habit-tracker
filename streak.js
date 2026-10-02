// Расчёт серий. Чистая логика без доступа к DOM и localStorage,
// поэтому её можно подключать и в index.html, и в tests.html.

// "YYYY-MM-DD" -> номер дня. Считаем через UTC, чтобы переход на летнее время не ломал разницу в днях.
function dayNumber(key) {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

// dates — даты выполнения (любой порядок, возможны повторы), today — "YYYY-MM-DD".
// Возвращает { current, best }:
//   current — серия дней подряд, заканчивающаяся сегодня; если сегодня ещё не отмечено,
//             серия считается от вчера и не обнуляется до конца дня;
//   best    — самая длинная серия за всё время.
// Даты из будущего (позже today) игнорируются.
function calcStreak(dates, today) {
  const todayN = dayNumber(today);
  const days = [...new Set(dates.map(dayNumber))].filter((n) => n <= todayN).sort((a, b) => a - b);
  if (days.length === 0) return { current: 0, best: 0 };

  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i] === days[i - 1] + 1 ? run + 1 : 1;
    if (run > best) best = run;
  }

  // `run` после цикла — длина последней серии; она текущая, только если доходит до сегодня или вчера.
  const last = days[days.length - 1];
  const current = last >= todayN - 1 ? run : 0;
  return { current, best };
}

if (typeof window !== "undefined") window.calcStreak = calcStreak;
if (typeof module !== "undefined") module.exports = { calcStreak, dayNumber };
