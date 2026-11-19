import test from "node:test";
import assert from "node:assert/strict";
import { emptyState } from "../src/logic.js";
import { runWatch } from "../src/watch.js";

const morning = new Date("2026-11-22T06:30:00Z");
const history = [
  { id: "1", start: "2026-06-10", end: "2026-06-14" },
  { id: "2", start: "2026-07-08", end: "2026-07-12" },
  { id: "3", start: "2026-08-05", end: "2026-08-09" },
  { id: "4", start: "2026-09-02", end: "2026-09-06" },
  { id: "5", start: "2026-09-30", end: "2026-10-04" },
  { id: "6", start: "2026-10-28", end: "2026-11-01" },
];

function book(sent = {}) {
  return { nextId: 7, cycles: history.map((cycle) => ({ ...cycle })), pending: null, sent: { ...sent }, tipCursor: 0, welcomed: true };
}

function scripted({ updates, watchSeconds, now = () => morning, send, onCall }) {
  let time = 0;
  const sent = [];
  return runWatch({
    state: updates.state,
    watchSeconds,
    now,
    clock: () => time,
    sleep: async (ms) => { time += ms; },
    log: () => {},
    persist: async () => {},
    send: send || (async (chatId, message) => { sent.push({ chatId, text: message.text }); }),
    call: async (method, body) => {
      if (onCall) onCall(method, body);
      if (method !== "getUpdates") return true;
      time += (body.timeout || 0) * 1000;
      const next = updates.queue.shift();
      if (next instanceof Error) throw next;
      return next || [];
    },
    sent,
    time: () => time,
  }).then((result) => ({ result, sent }));
}

test("a dropped connection still keeps the journal and the listener stays up", async () => {
  const state = emptyState();
  const queue = [new Error("قطع شد"), [{ update_id: 4, message: { chat: { id: 5 }, from: { first_name: "نیایش" }, text: "شروع امروز" } }]];
  const { result, sent } = await scripted({ updates: { state, queue }, watchSeconds: 70 });
  assert.equal(result.reason, "complete");
  assert.equal(state.users["5"].cycles.length, 1);
  assert.equal(state.users["5"].firstName, "نیایش");
  assert.match(sent[0].text, /یاسین خیلی دوستت داره/);
});

test("reminders go to every person once, and a failed send is retried", async () => {
  const state = emptyState();
  state.users["11"] = book();
  state.users["22"] = book();
  let failed = false;
  const sent = [];
  const first = await scripted({
    updates: { state, queue: [] },
    watchSeconds: 40,
    send: async (chatId, message) => {
      if (!failed && chatId === 11) {
        failed = true;
        throw new Error("نرفت");
      }
      sent.push({ chatId, text: message.text });
    },
  });
  assert.equal(first.result.reason, "complete");
  const ids = sent.map((item) => item.chatId).sort((a, b) => a - b);
  assert.deepEqual(ids, [11, 22]);
  for (const item of sent) {
    assert.match(item.text, /آذر/);
    assert.match(item.text, /یاسین خیلی دوستت داره/);
    assert.match(item.text, /مراقب خودت باش/);
    assert.doesNotMatch(item.text, /مفیدترین نسخه‌ی خودت/);
  }
  assert.ok(state.users["11"].sent["d3:2026-11-25"]);
  assert.ok(state.users["22"].sent["d3:2026-11-25"]);
  const again = await scripted({ updates: { state, queue: [] }, watchSeconds: 40 });
  assert.equal(again.sent.length, 0);
});

test("night hours stay quiet and a second poller steps aside", async () => {
  const state = emptyState();
  state.users["11"] = book();
  const quiet = await scripted({
    updates: { state, queue: [] },
    watchSeconds: 40,
    now: () => new Date("2026-11-22T04:30:00Z"),
  });
  assert.equal(quiet.sent.length, 0);
  const conflict = new Error("conflict");
  conflict.code = 409;
  const crowded = await scripted({
    updates: { state: emptyState(), queue: [conflict, conflict, conflict, conflict, conflict] },
    watchSeconds: 500,
  });
  assert.equal(crowded.result.reason, "conflict");
});
