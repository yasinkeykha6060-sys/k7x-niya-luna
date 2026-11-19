import test from "node:test";
import assert from "node:assert/strict";
import { addDays, daysBetween, isValidJalali, parseDate, tehranToday, toFaDigits, toGregorian, toJalali } from "../src/dates.js";
import { cycleStats, dueReminders, forecast, monthModel } from "../src/cycle.js";
import { emptyState, migrate, step } from "../src/logic.js";
import { petName, reminder, tip } from "../src/phrases.js";
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
  assert.equal(stats.periodLen, 5);
  assert.equal(forecast(cycles, "2026-11-18").next, "2026-11-25");
  const first = dueReminders(cycles, {}, "2026-11-22", 10);
  assert.equal(first[0].kind, "d3");
  assert.equal(dueReminders(cycles, {}, "2026-11-24", 9)[0].kind, "d1");
  assert.equal(dueReminders(cycles, {}, "2026-11-25", 21)[0].kind, "d0");
  assert.equal(dueReminders(cycles, {}, "2026-11-22", 8).length, 0);
  assert.equal(dueReminders(cycles, {}, "2026-11-22", 22).length, 0);
  const sent = { [first[0].key]: "2026-11-22" };
  assert.equal(dueReminders(cycles, sent, "2026-11-22", 10).length, 0);
  const open = [...cycles, { id: "8", start: "2026-11-20", end: null }];
  assert.equal(dueReminders(open, {}, "2026-11-22", 10).length, 0);
  assert.equal(daysBetween("2026-11-18", "2026-11-21"), 3);
  const unseen = monthModel([{ id: "1", start: "2026-10-28", end: null }], 1405, 9, "2026-11-18");
  assert.equal(unseen.stats.periodLen, null);
  assert.equal(unseen.days.filter((day) => day.predicted).length, 1);
  const known = monthModel(cycles, 1405, 9, "2026-11-18");
  assert.equal(known.days.filter((day) => day.predicted).length, 5);
});

test("each person keeps a reusable journal, with checks and fresh tips", () => {
  let state = emptyState();
  state = step(state, { chatId: 7, text: "/start" }, noon).state;
  state = step(state, { chatId: 7, text: "شروع ۱۴۰۵/۰۸/۰۱" }, noon).state;
  let result = step(state, { chatId: 7, text: "پایان ۱۴۰۵/۰۸/۰۵" }, noon);
  state = result.state;
  assert.match(result.replies[0].text, /آبان/);
  assert.match(result.replies[0].text, /یاسین خیلی دوستت داره/);
  assert.equal(state.users["7"].cycles[0].end, toGregorian(1405, 8, 5));
  result = step(state, { chatId: 7, text: "وضعیت" }, noon);
  assert.match(result.replies[0].text, /۲۸ روز/);
  assert.doesNotMatch(result.replies[0].text, /طول عادت/);
  assert.doesNotMatch(result.replies[0].text, /۵ روز/);
  result = step(state, { chatId: 7, text: "شروع ۱۴۰۵/۰۹/۰۱" }, noon);
  state = result.state;
  result = step(state, { chatId: 7, text: "پایان ۱۴۰۵/۰۹/۰۴" }, noon);
  state = result.state;
  assert.equal(state.users["7"].cycles.length, 2);
  result = step(state, { chatId: 9, text: "شروع ۱۴۰۵/۰۷/۱۰" }, noon);
  state = result.state;
  assert.equal(state.users["9"].cycles.length, 1);
  assert.equal(state.users["7"].cycles.length, 2);
  result = step(state, { chatId: 9, text: "وضعیت" }, noon);
  assert.match(result.replies[0].text, /مهر/);
  assert.doesNotMatch(result.replies[0].text, /آبان/);
  result = step(state, { chatId: 7, text: "تقویم" }, noon);
  assert.match(result.replies[0].text, /✓/);
  assert.match(result.replies[0].text, /تیک‌خورده/);
  result = step(state, { chatId: 7, text: "نکته" }, noon);
  const firstTip = result.replies[0].text;
  result = step(result.state, { chatId: 7, text: "نکته" }, noon);
  assert.notEqual(firstTip, result.replies[0].text);
  assert.match(firstTip, /مراقب خودت باش/);
  assert.match(firstTip, /یاسین خیلی دوستت داره/);
  assert.doesNotMatch(`${firstTip}\n${result.replies[0].text}`, /مفیدترین نسخه‌ی خودت/);
  state = step(state, { chatId: 7, data: "edits:1" }, noon).state;
  state = step(state, { chatId: 7, text: "1405/08/02" }, noon).state;
  assert.equal(state.users["7"].cycles[0].start, toGregorian(1405, 8, 2));
  result = step(state, { chatId: 7, data: "yesdel:1" }, noon);
  assert.equal(result.state.users["7"].cycles.length, 1);
  assert.equal(result.state.users["9"].cycles.length, 1);
  result = step(result.state, { chatId: 7, text: "جستجو درد" }, noon);
  assert.match(result.replies[0].text, /پزشک/);
  result = step(emptyState(), { chatId: 3, text: "سلام" }, noon);
  assert.match(result.replies[0].text, /خوش آمدی آنی خانمم/);
  assert.match(result.replies[0].text, /دفترچه/);
  result = step(result.state, { chatId: 3, text: "داروها" }, noon);
  assert.match(result.replies[0].text, /t\.me\/Niyayesh_Love_bot/);
  assert.match(result.replies[0].text, /نیاشم|نیایش جانم|نیایش عزیزم/);
  const names = new Set(["۱", "۲", "۳", "۴"].map((seed) => petName(seed)));
  assert.ok(names.size >= 2);
  assert.equal(result.state.users["3"].welcomed, true);
  assert.equal(toFaDigits(27), "۲۷");
  assert.equal(tehranToday(noon), "2026-11-18");
});

test("tips and reminders stay warm, varied, and free of a fixed period length", () => {
  const seen = new Set();
  for (let cursor = 0; cursor < 24; cursor += 1) seen.add(tip("period", cursor));
  assert.ok(seen.size >= 12);
  const all = ["soon", "period", "mid", "calm"].flatMap((phase) => Array.from({ length: 16 }, (_, cursor) => tip(phase, cursor)));
  for (const text of all) {
    assert.match(text, /مراقب خودت باش\. یاسین خیلی دوستت داره\./);
    assert.doesNotMatch(text, /مفیدترین نسخه‌ی خودت/);
    assert.doesNotMatch(text, /۵ روز/);
  }
  assert.ok(all.some((text) => text.includes("سوپ") || text.includes("آش")));
  for (const kind of ["d3", "d1", "d0"]) {
    const text = reminder({ kind, next: "2026-11-25", key: `${kind}:2026-11-25`, approximate: false });
    assert.match(text, /آذر/);
    assert.match(text, /یاسین خیلی دوستت داره/);
    assert.doesNotMatch(text, /مفیدترین نسخه‌ی خودت/);
  }
  const old = { version: 1, ownerChatId: 4, offset: 9, nextId: 3, cycles: [{ id: "1", start: "2026-11-01" }], pending: null, sent: {} };
  const moved = migrate(old);
  assert.equal(moved.offset, 9);
  assert.equal(moved.users["4"].cycles[0].start, "2026-11-01");
  assert.equal(moved.ownerChatId, undefined);
});

test("partner sees names, selection sticks, and dates can be typed by hand", () => {
  let state = emptyState();
  let result = step(state, { chatId: 99, text: "من یاسینم" }, noon);
  state = result.state;
  assert.equal(state.partner.chatId, "99");
  assert.match(result.replies[0].text, /شناخته شدی/);
  result = step(state, { chatId: 8, username: "tester", firstName: "سارا", text: "شروع ۱۴۰۵/۰۷/۰۱" }, noon);
  state = result.state;
  assert.equal(result.copies[0].chatId, "99");
  assert.match(result.copies[0].text, /سارا \(@tester\)/);
  assert.equal(state.users["8"].firstName, "سارا");
  result = step(state, { chatId: 7, firstName: "نیایش", username: "NIH235", text: "شروع ۱۴۰۵/۰۸/۰۱" }, noon);
  state = result.state;
  assert.match(result.copies[0].text, /نیایش/);
  assert.equal(state.homeChatId, "8");
  result = step(state, { chatId: 99, text: "کاربران" }, noon);
  state = result.state;
  assert.match(result.replies[0].text, /نیایش/);
  assert.match(result.replies[0].text, /سارا/);
  assert.doesNotMatch(result.replies[0].text, /^7 ·/m);
  result = step(state, { chatId: 99, data: "u:7" }, noon);
  state = result.state;
  assert.equal(state.homeChatId, "7");
  assert.match(result.replies[0].text, /نیایش/);
  assert.match(result.replies[0].text, /انتخاب شد/);
  assert.match(result.replies[1].text, /آخرین شروع|هنوز تاریخی|فاصله/);
  result = step(state, { chatId: 8, firstName: "سارا", text: "پایان ۱۴۰۵/۰۷/۰۵" }, noon);
  state = result.state;
  assert.equal(state.homeChatId, "7");
  result = step(state, { chatId: 99, text: "وضعیت" }, noon);
  assert.match(result.replies[0].text, /آبان|۲۸ روز|شروع/);
  result = step(state, { chatId: 99, text: "ثبت پایان" }, noon);
  state = result.state;
  assert.equal(state.users["7"].pending.kind, "log-end");
  result = step(state, { chatId: 99, text: "۱۴۰۵/۰۸/۰۵" }, noon);
  state = result.state;
  assert.equal(state.users["7"].cycles[0].end, toGregorian(1405, 8, 5));
  result = step(state, { chatId: 99, text: "ثبت شروع" }, noon);
  state = result.state;
  result = step(state, { chatId: 99, text: "1405/08/20" }, noon);
  assert.equal(result.state.users["7"].cycles.length, 2);
  assert.equal(result.state.users["7"].cycles[1].start, toGregorian(1405, 8, 20));
});

test("the journal seals and opens without leaking plaintext", () => {
  const key = randomBytes(32);
  const secret = { cycles: [{ start: "2026-11-18" }] };
  const payload = seal(secret, key);
  assert.equal(payload.includes("2026-11-18"), false);
  assert.equal(open(payload, key).cycles[0].start, "2026-11-18");
});
