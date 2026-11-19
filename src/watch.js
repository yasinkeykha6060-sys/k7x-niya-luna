import { dueReminders } from "./cycle.js";
import { tehranHour, tehranToday } from "./dates.js";
import { MAIN_KEYBOARD, displayName, migrate, step } from "./logic.js";
import { reminder } from "./phrases.js";

const COMMANDS = [
  { command: "start", description: "باز کردن دفترچه" },
  { command: "status", description: "وضعیت و تاریخ بعدی" },
  { command: "calendar", description: "تقویم این ماه" },
  { command: "dates", description: "ویرایش و حذف" },
  { command: "tip", description: "یک نکته‌ی تازه" },
  { command: "help", description: "راهنما" },
];

function defaultSend(call, chatId, message) {
  const body = {
    chat_id: chatId,
    text: message.text,
    reply_markup: message.inline || message.keyboard,
  };
  if (message.text.includes("<pre>")) body.parse_mode = "HTML";
  return call("sendMessage", body);
}

async function deliverResult(state, result, replyChatId, send, log = () => {}) {
  Object.assign(state, result.state);
  for (const message of result.replies) await send(replyChatId, message);
  for (const copy of result.copies || []) {
    if (!copy?.chatId || !copy.text) continue;
    try {
      await send(Number(copy.chatId) || copy.chatId, {
        text: copy.text,
        keyboard: copy.inline ? undefined : MAIN_KEYBOARD,
        inline: copy.inline,
      });
    } catch (error) {
      log(error.message || `خبر برای ${copy.chatId} نرفت`);
      state.partnerQueue = state.partnerQueue || [];
      if (state.partnerQueue.length < 30) state.partnerQueue.push(copy.text);
    }
  }
}

async function handleUpdate(state, update, now, send, call, log = () => {}) {
  if (update.callback_query) {
    const query = update.callback_query;
    if (query.message?.chat?.type && query.message.chat.type !== "private") return;
    try { await call("answerCallbackQuery", { callback_query_id: query.id }); } catch { /* the reply still goes out */ }
    const result = step(state, {
      chatId: query.message.chat.id,
      data: query.data,
      text: "",
      username: query.from?.username || "",
      firstName: query.from?.first_name || "",
      lastName: query.from?.last_name || "",
    }, now);
    await deliverResult(state, result, query.message.chat.id, send, log);
    return;
  }
  const message = update.message;
  if (!message?.chat?.id || (message.chat.type && message.chat.type !== "private")) return;
  const result = step(state, {
    chatId: message.chat.id,
    text: message.text || "",
    username: message.from?.username || "",
    firstName: message.from?.first_name || "",
    lastName: message.from?.last_name || "",
  }, now);
  await deliverResult(state, result, message.chat.id, send, log);
}

async function remind(state, now, send, log) {
  const today = tehranToday(now);
  const hour = tehranHour(now);
  for (const [chatId, user] of Object.entries(state.users || {})) {
    if (!user?.cycles) continue;
    const items = dueReminders(user.cycles, user.sent || {}, today, hour);
    for (const item of items) {
      try {
        await send(Number(chatId), { text: reminder(item), keyboard: MAIN_KEYBOARD });
        user.sent[item.key] = today;
        if (state.partner?.chatId && String(state.partner.chatId) !== String(chatId)) {
          const who = displayName(user, chatId);
          try {
            await send(Number(state.partner.chatId), {
              text: `یادآوری برای ${who}:\n${reminder(item)}`,
              inline: {
                inline_keyboard: [[
                  { text: "وضعیت", callback_data: `p:status:${chatId}` },
                  { text: "تقویم", callback_data: `p:cal:${chatId}` },
                  { text: "تاریخ‌ها", callback_data: `p:dates:${chatId}` },
                ]],
              },
            });
          } catch { /* her reminder already stands */ }
        }
      } catch (error) {
        log(error.message || "یادآوری نرفت");
      }
    }
  }
}

export async function runWatch({
  state,
  call,
  send,
  watchSeconds = 0,
  now = () => new Date(),
  clock = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  persist = async () => {},
  log = () => {},
}) {
  migrate(state);
  const deliver = send || ((chatId, message) => defaultSend(call, chatId, message));
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await call("setMyCommands", { commands: COMMANDS });
      break;
    } catch (error) {
      log(error.message || "منو ثبت نشد");
      if (attempt < 5) await sleep(3000);
    }
  }

  const deadline = clock() + watchSeconds * 1000;
  let conflicts = 0;
  let lastBeat = clock();
  for (;;) {
    const remaining = watchSeconds ? Math.floor((deadline - clock()) / 1000) : 0;
    if (watchSeconds && remaining < 2) break;
    try {
      const updates = await call("getUpdates", {
        offset: state.offset,
        timeout: watchSeconds ? Math.min(30, Math.max(0, remaining)) : 0,
        allowed_updates: ["message", "callback_query"],
      });
      conflicts = 0;
      for (const update of updates || []) {
        state.offset = update.update_id + 1;
        try {
          await handleUpdate(state, update, now(), deliver, call, log);
        } catch (error) {
          log(error.message || "این پیام نماند");
        }
        try { await persist(state); } catch (error) { log(error.message || "ذخیره نماند"); }
      }
      await remind(state, now(), deliver, log);
      try { await persist(state); } catch (error) { log(error.message || "ذخیره نماند"); }
      if (clock() - lastBeat >= 600000) {
        log("ربات روشن است و گوش می‌دهد.");
        lastBeat = clock();
      }
    } catch (error) {
      if (error.code === 409) {
        conflicts += 1;
        log("یک نسخه‌ی دیگر در حال گوش دادن است. کمی صبر می‌کنم.");
        if (conflicts >= 5) return { reason: "conflict" };
        await sleep(15000);
        continue;
      }
      log(error.message || "خطای موقت. دوباره گوش می‌دهم.");
      await sleep(5000);
      continue;
    }
    if (!watchSeconds) break;
  }
  return { reason: "complete" };
}
