import { addDays, daysBetween, monthLength, toGregorian, weekdayColumn } from "./dates.js";

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function sortedCycles(cycles) {
  return [...cycles].filter((cycle) => cycle.start).sort((a, b) => a.start.localeCompare(b.start));
}

export function cycleStats(cycles) {
  const sorted = sortedCycles(cycles);
  const gaps = [];
  const skipped = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const gap = daysBetween(sorted[index - 1].start, sorted[index].start);
    if (gap >= 18 && gap <= 45) gaps.push(gap);
    else skipped.push(gap);
  }
  const bleeds = sorted
    .filter((cycle) => cycle.end)
    .map((cycle) => daysBetween(cycle.start, cycle.end) + 1)
    .filter((days) => days >= 2 && days <= 10);
  return {
    sorted,
    gaps,
    skipped,
    cycleLen: gaps.length ? Math.round(average(gaps)) : 28,
    periodLen: bleeds.length ? Math.round(average(bleeds)) : 5,
    enough: gaps.length >= 2,
    usedDefaultCycle: gaps.length === 0,
    usedDefaultPeriod: bleeds.length === 0,
  };
}

export function openCycle(cycles) {
  const sorted = sortedCycles(cycles);
  const last = sorted[sorted.length - 1];
  if (last && !last.end) return last;
  return null;
}

export function forecast(cycles, today) {
  const stats = cycleStats(cycles);
  if (!stats.sorted.length) return { stats, next: null, lateDays: 0, last: null };
  const last = stats.sorted[stats.sorted.length - 1].start;
  let next = addDays(last, stats.cycleLen);
  let rolled = false;
  let guard = 0;
  while (daysBetween(today, next) < -7 && guard < 8) {
    next = addDays(next, stats.cycleLen);
    rolled = true;
    guard += 1;
  }
  return { stats, last, next, lateDays: rolled ? 0 : Math.max(0, daysBetween(next, today)), rolled };
}

export function loggedDays(cycles) {
  const days = new Set();
  for (const cycle of cycles) {
    if (!cycle.start || !cycle.end || cycle.end < cycle.start) continue;
    let day = cycle.start;
    for (let guard = 0; guard < 14 && day <= cycle.end; guard += 1) {
      days.add(day);
      day = addDays(day, 1);
    }
  }
  return days;
}

export function rangeDays(start, count) {
  const days = new Set();
  if (!start || count < 1) return days;
  let day = start;
  for (let index = 0; index < count; index += 1) {
    days.add(day);
    day = addDays(day, 1);
  }
  return days;
}

export function monthModel(cycles, jy, jm, today) {
  const { stats, next } = forecast(cycles, today);
  const logged = loggedDays(cycles);
  const predicted = next ? rangeDays(next, stats.periodLen) : new Set();
  const pms = next ? rangeDays(addDays(next, -3), 3) : new Set();
  const length = monthLength(jy, jm);
  const first = toGregorian(jy, jm, 1);
  const days = [];
  for (let jd = 1; jd <= length; jd += 1) {
    const iso = toGregorian(jy, jm, jd);
    days.push({
      jd,
      iso,
      logged: logged.has(iso),
      predicted: predicted.has(iso) && !logged.has(iso),
      pms: pms.has(iso) && !logged.has(iso) && !predicted.has(iso),
      today: iso === today,
    });
  }
  return { days, lead: weekdayColumn(first), stats, next };
}

export function dueReminders(cycles, sent, today, hour) {
  if (hour < 9 || hour > 21) return [];
  const { stats, next } = forecast(cycles, today);
  if (!next) return [];
  const current = openCycle(cycles);
  if (current && daysBetween(current.start, today) >= 0 && daysBetween(current.start, today) <= 10) return [];
  const until = daysBetween(today, next);
  const plan = [
    [3, "d3"],
    [1, "d1"],
    [0, "d0"],
  ];
  return plan
    .filter(([days]) => until === days)
    .map(([, kind]) => ({ kind, next, key: `${kind}:${next}`, approximate: stats.usedDefaultCycle }))
    .filter((item) => !sent[item.key]);
}
