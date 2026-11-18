import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, step } from "../src/logic.js";
import { mergeJournals } from "../src/memory.js";

const noon = new Date("2026-11-18T12:00:00Z");

function started(chatId, text) {
  return step(emptyState(), { chatId, text }, noon).state;
}

test("two journals merge without dropping either person's dates", () => {
  const hers = started(1, "شروع ۱۴۰۵/۰۸/۰۱");
  const other = started(2, "شروع ۱۴۰۵/۰۹/۰۲");
  const merged = mergeJournals(hers, other);
  assert.equal(merged.users["1"].cycles.length, 1);
  assert.equal(merged.users["2"].cycles.length, 1);
  assert.equal(merged.users["1"].cycles[0].start, hers.users["1"].cycles[0].start);
  assert.equal(merged.users["2"].cycles[0].start, other.users["2"].cycles[0].start);
});

test("a deleted date stays deleted when an older copy is merged back", () => {
  let current = started(7, "شروع ۱۴۰۵/۰۸/۰۱");
  const older = structuredClone(current);
  const id = current.users["7"].cycles[0].id;
  current = step(current, { chatId: 7, data: `yesdel:${id}` }, noon).state;
  assert.equal(current.users["7"].cycles.length, 0);
  assert.equal(current.users["7"].gone[id], current.users["7"].rev);
  const merged = mergeJournals(current, older);
  assert.equal(merged.users["7"].cycles.length, 0);
  const back = mergeJournals(older, current);
  assert.equal(back.users["7"].cycles.length, 0);
});

test("a newer edit wins, an ending is kept, and another person's date stays", () => {
  let base = started(4, "شروع ۱۴۰۵/۰۸/۰۱");
  const stale = structuredClone(base);
  base = step(base, { chatId: 4, data: "edits:1" }, noon).state;
  base = step(base, { chatId: 4, text: "1405/08/03" }, noon).state;
  const extra = step(stale, { chatId: 9, text: "شروع ۱۴۰۵/۰۷/۱۲" }, noon).state;
  const merged = mergeJournals(base, extra);
  assert.equal(merged.users["4"].cycles.length, 1);
  assert.equal(merged.users["4"].cycles[0].start, base.users["4"].cycles[0].start);
  assert.equal(merged.users["9"].cycles.length, 1);
  const closed = step(structuredClone(stale), { chatId: 4, text: "پایان ۱۴۰۵/۰۸/۰۵" }, noon).state;
  const withEnd = mergeJournals(stale, closed);
  assert.equal(withEnd.users["4"].cycles.length, 1);
  assert.equal(withEnd.users["4"].cycles[0].end, closed.users["4"].cycles[0].end);
  assert.ok(merged.offset >= base.offset);
});
