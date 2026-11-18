import test from "node:test";
import assert from "node:assert/strict";
import { addDays, daysBetween, isValidJalali, parseDate, tehranToday, toFaDigits, toGregorian, toJalali } from "../src/dates.js";
import { cycleStats, dueReminders, forecast } from "../src/cycle.js";
import { emptyState, step } from "../src/logic.js";
import { open, seal } from "../src/store.js";
import { randomBytes } from "node:crypto";

const noon = new Date("2026-11-18T12:00:00Z");

test("18 Nov 2026 is 27 Aban 1405 and round-trips", () => {
  const jalali = toJalali("2026-11-18");
  assert.deepEqual(jalali, { jy: 1405, jm: 8, jd: 27 });
  assert.equal(toGregorian(1405, 8, 27), "2026-11-18");
  assert.equal(isValidJalali(1405, 8, 31), false);
  assert.equal(isValidJalali(1403, 12, 30), true);
  assert.equal(isValidJalali(1404, 12, 30), false);
});

test("every tenth day from 2020 through 2030 survives a Jalali round-trip", () => {
  let day = "2020-01-01";
  while (day <= "2030-12-31") {
    const jalali = toJalali(day);
    assert.equal(toGregorian(jalali.jy, jalali.jm, jalali.jd), day);
    day = addDays(day, 10);
  }
});

test("Persian dates and both calendars parse to the same day", () => {
  assert.equal(parseDate("امروز", "2026-11-18"), "2026-11-18");
  assert.equal(parseDate("دیروز", "2026-11-18"), "2026-11-17");
  assert.equal(parseDate("۱۴۰۵/۰۸/۲۷", "2026-11-18"), "2026-11-18");
  assert.equal(parseDate("27 آبان 1405", "2026-11-18"), "2026-11-18");
  assert.equal(parseDate("2026-11-18", "2026-11-18"), "2026-11-18");
  assert.equal(parseDate("1405/12/30", "2026-11-18"), null);
});

test("cycle length ignores a wild gap and reminders fire once", () => {
  const cycles = [
    { id: "1", start: "2026-06-01", end: "2026-06-05" },
    { id: "2", start: "2026-06-10", end: "2026-06-14" },
    { id: "3", start: "2026-07-08", end: "2026-07-12" },
    { id: "4", start: "2026-08-05", end: "2026-08-09" },
    { id: "5", start: "2026-09-02", end: "2026-09-06" },
    { id: "6", start: "2026-09-30", end: "2026-10-04" },
    { id: "7", start: "2026-10-28", end: "2026-11-01" },
  ];
  const stats = cycleStats(cycles);
  assert.equal(stats.skipped.length, 1);
  assert.equal(stats.cycleLen, 28);
  assert.equal(forecast(cycles, "2026-11-18").next, "2026-11-25");
  const first = dueReminders(cycles, {}, "2026-11-22", 10);
  assert.equal(first[0].kind, "d3");
  const sent = { [first[0].key]: "2026-11-18" };
  assert.equal(dueReminders(cycles, sent, "2026-11-18", 10).length, 0);
  assert.equal(dueReminders(cycles, {}, "2026-11-18", 2).length, 0);
  assert.equal(daysBetween("2026-11-18", "2026-11-21"), 3);
});

test("logging, editing, deleting and searching stay consistent", () => {
  let state = emptyState();
  state = step(state, { chatId: 7, text: "/start" }, noon).state;
  state = step(state, { chatId: 7, text: "شروع ۱۴۰۵/۰۸/۰۱" }, noon).state;
  let result = step(state, { chatId: 7, text: "پایان ۱۴۰۵/۰۸/۰۵" }, noon);
  state = result.state;
  assert.match(result.replies[0].text, /آبان/);
  assert.equal(state.cycles[0].end, toGregorian(1405, 8, 5));
  result = step(state, { chatId: 7, text: "وضعیت" }, noon);
  assert.match(result.replies[0].text, /۲۸ روز/);
  result = step(state, { chatId: 9, text: "وضعیت" }, noon);
  assert.match(result.replies[0].text, /مال نیایش/);
  result = step(state, { chatId: 7, data: "edits:1" }, noon);
  state = result.state;
  result = step(state, { chatId: 7, text: "1405/08/02" }, noon);
  state = result.state;
  assert.equal(state.cycles[0].start, toGregorian(1405, 8, 2));
  result = step(state, { chatId: 7, data: "yesdel:1" }, noon);
  assert.equal(result.state.cycles.length, 0);
  result = step(result.state, { chatId: 7, text: "جستجو درد" }, noon);
  assert.match(result.replies[0].text, /پزشک/);
  result = step(emptyState(), { chatId: 3, text: "سلام" }, noon);
  assert.match(result.replies[0].text, /\/start/);
  assert.equal(toFaDigits(27), "۲۷");
  assert.equal(tehranToday(noon), "2026-11-18");
});

test("the journal seals and opens without leaking plaintext", () => {
  const key = randomBytes(32);
  const secret = { cycles: [{ start: "2026-11-18" }] };
  const payload = seal(secret, key);
  assert.equal(payload.includes("2026-11-18"), false);
  assert.equal(open(payload, key).cycles[0].start, "2026-11-18");
});
