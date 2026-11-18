import { execSync } from "node:child_process";
import { dueReminders } from "./cycle.js";
import { tehranHour, tehranToday } from "./dates.js";
import { MAIN_KEYBOARD, step } from "./logic.js";
import { reminder } from "./phrases.js";
import { load, save } from "./store.js";
import { callTelegram } from "./telegram.js";

const watchSeconds = Number(process.env.WATCH_SECONDS || 0);

function snapshot(state) {
  return JSON.stringify(state);
}

function pushJournal() {
  if (process.env.AUTO_PUSH !== "1") return;
  execSync("git add data/state.enc");
  try {
    execSync("git diff --cached --quiet");
  } catch {
    execSync("git commit -m \"Update journal\"");
    execSync("git push");
  }
}

function persist(state, seen) {
  const next = snapshot(state);
  if (next === seen) return next;
  save(state);
  try { pushJournal(); } catch (error) {
    console.error("دفترچه ذخیره شد ولی فرستادن به گیت‌هاب نماند.");
    console.error(error.message);
  }
  return next;
}

async function deliver(chatId, message) {
  const body = {
    chat_id: chatId,
    text: message.text,
    reply_markup: message.inline || message.keyboard,
  };
  if (message.text.includes("<pre>")) body.parse_mode = "HTML";
  await callTelegram("sendMessage", body);
}

async function remind(state, now) {
  if (!state.ownerChatId) return;
  const items = dueReminders(state.cycles, state.sent, tehranToday(now), tehranHour(now));
  for (const item of items) {
    state.sent[item.key] = tehranToday(now);
    await deliver(state.ownerChatId, { text: reminder(item), keyboard: MAIN_KEYBOARD });
  }
}

async function handleUpdate(state, update, now) {
  if (update.callback_query) {
    const query = update.callback_query;
    await callTelegram("answerCallbackQuery", { callback_query_id: query.id });
    const result = step(state, { chatId: query.message.chat.id, data: query.data, text: "" }, now);
    Object.assign(state, result.state);
    for (const message of result.replies) await deliver(query.message.chat.id, message);
    return;
  }
  const message = update.message;
  if (!message?.chat?.id) return;
  const result = step(state, { chatId: message.chat.id, text: message.text || "" }, now);
  Object.assign(state, result.state);
  for (const item of result.replies) await deliver(message.chat.id, item);
}

async function main() {
  let state = load();
  let seen = snapshot(state);
  await callTelegram("setMyCommands", {
    commands: [
      { command: "start", description: "باز کردن دفترچه" },
      { command: "status", description: "وضعیت و تاریخ بعدی" },
      { command: "calendar", description: "تقویم این ماه" },
      { command: "dates", description: "ویرایش و حذف" },
      { command: "tip", description: "یک نکته" },
      { command: "help", description: "راهنما" },
    ],
  });
  const deadline = Date.now() + watchSeconds * 1000;
  for (;;) {
    const remaining = watchSeconds ? Math.floor((deadline - Date.now()) / 1000) : 0;
    if (watchSeconds && remaining < 2) break;
    let updates = [];
    try {
      updates = await callTelegram("getUpdates", {
        offset: state.offset,
        timeout: watchSeconds ? Math.min(30, remaining) : 0,
        allowed_updates: ["message", "callback_query"],
      });
    } catch (error) {
      if (error.code === 409) {
        console.error("یک نسخه‌ی دیگر از ربات در حال گوش دادن است.");
        process.exit(1);
      }
      throw error;
    }
    for (const update of updates) {
      state.offset = update.update_id + 1;
      try {
        await handleUpdate(state, update, new Date());
      } catch (error) {
        console.error(error.message);
      }
      seen = persist(state, seen);
    }
    await remind(state, new Date());
    seen = persist(state, seen);
    if (!watchSeconds) break;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
