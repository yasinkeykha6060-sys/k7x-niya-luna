import { renderCalendar } from "./calendar.js";
import { forecast, openCycle } from "./cycle.js";
import { formatDual, formatJalali, parseDate, tehranToday, toJalali } from "./dates.js";
import { searchHint, searchKnowledge } from "./knowledge.js";
import { MEDICINE_URL, phaseOf, reminder, savedEnd, savedStart, statusText, tip, welcome } from "./phrases.js";

export function emptyState() {
  return { version: 1, ownerChatId: null, offset: 0, nextId: 1, cycles: [], pending: null, sent: {} };
}

export const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "ثبت شروع" }, { text: "ثبت پایان" }],
    [{ text: "وضعیت" }, { text: "تقویم" }],
    [{ text: "نکته" }, { text: "جستجو" }],
    [{ text: "تاریخ‌ها" }, { text: "داروها" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

function reply(text, extra = {}) {
  return { text, keyboard: extra.inline ? undefined : MAIN_KEYBOARD, inline: extra.inline };
}

function esc(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function norm(text) {
  return String(text || "")
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/^\/([a-z]+)@\w+/i, "/$1")
    .replace(/\s+/g, " ")
    .trim();
}

function findCycle(state, id) {
  return state.cycles.find((cycle) => cycle.id === String(id));
}

function addStart(state, iso) {
  if (openCycle(state.cycles)) return { error: "یک عادت هنوز باز است. اول «ثبت پایان» را بزن، یا از تاریخ‌ها اصلاحش کن." };
  if (state.cycles.some((cycle) => cycle.start === iso)) return { error: "این شروع را قبلاً نوشته‌ام." };
  const cycle = { id: String(state.nextId), start: iso, end: null, note: "" };
  state.nextId += 1;
  state.cycles.push(cycle);
  return { cycle };
}

function closeLatest(state, iso) {
  const cycle = openCycle(state.cycles);
  if (!cycle) return { error: "عادتِ بازی نداریم. اگر شروع را نزده‌ای، اول «ثبت شروع» را بزن." };
  if (iso < cycle.start) return { error: "پایان نمی‌تواند قبل از شروع باشد." };
  cycle.end = iso;
  return { cycle };
}

function listText(state) {
  const cycles = [...state.cycles].sort((a, b) => b.start.localeCompare(a.start)).slice(0, 12);
  if (!cycles.length) return { text: "هنوز تاریخی نیست.", inline: undefined };
  const lines = cycles.map((cycle) => {
    const end = cycle.end ? formatJalali(cycle.end) : "باز";
    const note = cycle.note ? `، ${esc(cycle.note)}` : "";
    return `${cycle.id}) ${formatJalali(cycle.start)} تا ${end}${note}`;
  });
  const inline = {
    inline_keyboard: cycles.map((cycle) => [
      { text: `شروع ${cycle.id}`, callback_data: `edits:${cycle.id}` },
      { text: `پایان ${cycle.id}`, callback_data: `edite:${cycle.id}` },
      { text: `حذف ${cycle.id}`, callback_data: `del:${cycle.id}` },
    ]),
  };
  return { text: `تاریخ‌ها، جدیدترها بالا:\n${lines.join("\n")}\nبرای اصلاح، دکمه‌ی همان شماره را بزن.`, inline };
}

function menuButton(text) {
  return ["ثبت شروع", "ثبت پایان", "وضعیت", "تقویم", "نکته", "جستجو", "تاریخ‌ها", "تاریخها", "داروها", "دارو", "راهنما"].includes(text);
}

export function step(raw, event, now = new Date()) {
  const state = structuredClone(raw);
  const today = tehranToday(now);
  const chatId = event.chatId;
  const text = norm(event.text || "");
  const data = event.data || "";
  const replies = [];

  if (!state.ownerChatId) {
    if (text === "/start" || text === "شروع دفتر") {
      state.ownerChatId = chatId;
      replies.push(reply(welcome(false)));
      return { state, replies };
    }
    replies.push(reply("این دفترچه هنوز مال کسی نشده. نیایش جان، /start را بزن تا فقط برای تو بماند.", { inline: undefined }));
    replies[0].keyboard = undefined;
    return { state, replies };
  }

  if (chatId !== state.ownerChatId) {
    return { state, replies: [{ text: "این دفترچه مال نیایش است.", keyboard: undefined }] };
  }

  if (data.startsWith("cal:")) {
    const [, year, month] = data.split(":");
    const view = renderCalendar(state.cycles, Number(year), Number(month), today);
    replies.push({ text: view.text, inline: view.inline });
    return { state, replies };
  }

  if (data.startsWith("del:")) {
    const cycle = findCycle(state, data.slice(4));
    if (!cycle) replies.push(reply("این شماره را پیدا نکردم."));
    else {
      replies.push({
        text: `این را پاک کنم؟\n${formatDual(cycle.start)}`,
        inline: { inline_keyboard: [[
          { text: "بله، پاک شود", callback_data: `yesdel:${cycle.id}` },
          { text: "نه", callback_data: "nodel" },
        ]] },
      });
    }
    return { state, replies };
  }

  if (data.startsWith("yesdel:")) {
    const id = data.slice(7);
    const before = state.cycles.length;
    state.cycles = state.cycles.filter((cycle) => cycle.id !== id);
    replies.push(reply(state.cycles.length === before ? "قبلاً پاک شده بود." : "پاک شد. تقویم هم خودش را با همین حساب تازه می‌کند."));
    return { state, replies };
  }

  if (data === "nodel") {
    replies.push(reply("باشد، دست نزدم."));
    return { state, replies };
  }

  if (data.startsWith("edits:") || data.startsWith("edite:")) {
    const kind = data.startsWith("edits:") ? "edit-start" : "edit-end";
    const id = data.split(":")[1];
    if (!findCycle(state, id)) replies.push(reply("این شماره را پیدا نکردم."));
    else {
      state.pending = { kind, id };
      replies.push(reply("تاریخ تازه را بفرست. مثلاً ۱۴۰۵/۰۸/۲۷ یا 2026-11-18 یا امروز. اگر منصرف شدی، «بیخیال» را بنویس."));
    }
    return { state, replies };
  }

  if (text === "بیخیال") {
    state.pending = null;
    replies.push(reply("باشد. هیچ‌چیز عوض نشد."));
    return { state, replies };
  }

  if (text === "آزادش کن") {
    state.ownerChatId = null;
    state.pending = null;
    replies.push({ text: "دفترچه آزاد شد. نفر بعدی که /start بزند صاحبش می‌شود. نیایش از گوشی خودش این کار را بکند.", keyboard: { remove_keyboard: true } });
    return { state, replies };
  }

  if (menuButton(text)) state.pending = null;

  if (state.pending && !text.startsWith("/")) {
    if (state.pending.kind === "search") {
      state.pending = null;
      replies.push(reply(searchKnowledge(text) || `برای «${esc(text)}» یادداشت آماده‌ای ندارم.\n${searchHint()}`));
      return { state, replies };
    }
    const iso = parseDate(text, today);
    if (!iso) {
      replies.push(reply("این تاریخ را نخواندم. یک بار دیگر، مثل ۱۴۰۵/۰۸/۲۷ یا ۲۷ آبان ۱۴۰۵."));
      return { state, replies };
    }
    const cycle = findCycle(state, state.pending.id);
    if (!cycle) {
      state.pending = null;
      replies.push(reply("آن مورد دیگر در دفترچه نیست."));
      return { state, replies };
    }
    if (state.pending.kind === "edit-start") {
      if (cycle.end && iso > cycle.end) replies.push(reply("شروع بعد از پایان نمی‌شود."));
      else {
        cycle.start = iso;
        state.pending = null;
        replies.push(reply(`شروع را عوض کردم: ${formatDual(iso)}`));
      }
    } else {
      if (iso < cycle.start) replies.push(reply("پایان قبل از شروع نمی‌شود."));
      else {
        cycle.end = iso;
        state.pending = null;
        replies.push(reply(`پایان را عوض کردم: ${formatDual(iso)}`));
      }
    }
    return { state, replies };
  }

  if (text === "/start") {
    replies.push(reply(welcome(true)));
    return { state, replies };
  }

  if (text === "راهنما" || text === "/help") {
    replies.push(reply([
      "ثبت شروع و ثبت پایان، برای امروز.",
      "اگر تاریخ دیگری است: شروع ۱۴۰۵/۰۸/۲۷ یا پایان دیروز.",
      "تاریخ‌ها را می‌شود ویرایش یا حذف کرد.",
      "تقویم، شمسی است و کنارش میلادی را هم می‌نویسد.",
      "جستجو، از یادداشت‌های همین دفترچه جواب می‌دهد، نه از یک صفحه‌ی ناشناس.",
      "داروها در ربات جدا یادآوری می‌شوند.",
    ].join("\n")));
    return { state, replies };
  }

  if (text === "داروها" || text === "دارو") {
    replies.push(reply(`نیایش جان، قرص‌ها و ویتامین‌ها را همان ربات قبلی یادت می‌آورد تا با این دفترچه قاطی نشود.\n${MEDICINE_URL}`));
    return { state, replies };
  }

  if (text === "وضعیت" || text === "/status") {
    replies.push(reply(statusText(forecast(state.cycles, today), today)));
    return { state, replies };
  }

  if (text === "نکته" || text === "/tip") {
    const cast = forecast(state.cycles, today);
    replies.push(reply(tip(phaseOf(cast, today), today)));
    return { state, replies };
  }

  if (text === "تقویم" || text === "/calendar") {
    const nowJ = toJalali(today);
    const view = renderCalendar(state.cycles, nowJ.jy, nowJ.jm, today);
    replies.push({ text: view.text, inline: view.inline, keyboard: MAIN_KEYBOARD });
    return { state, replies };
  }

  if (text === "تاریخ‌ها" || text === "تاریخها" || text === "/dates") {
    const view = listText(state);
    replies.push({ text: view.text, inline: view.inline, keyboard: MAIN_KEYBOARD });
    return { state, replies };
  }

  if (text === "جستجو" || text === "/search") {
    state.pending = { kind: "search" };
    replies.push(reply(searchHint()));
    return { state, replies };
  }

  if (text.startsWith("جستجو ")) {
    const query = text.slice(7);
    replies.push(reply(searchKnowledge(query) || `برای «${esc(query)}» یادداشت آماده‌ای ندارم.\n${searchHint()}`));
    return { state, replies };
  }

  if (text.startsWith("یادداشت ")) {
    const cycle = [...state.cycles].sort((a, b) => b.start.localeCompare(a.start))[0];
    if (!cycle) replies.push(reply("اول یک تاریخ ثبت کن، بعد یادداشت را بگو."));
    else {
      cycle.note = text.slice(8).slice(0, 80);
      replies.push(reply(`یادداشت را برای ${formatJalali(cycle.start)} گذاشتم.`));
    }
    return { state, replies };
  }

  const startMatch = text.match(/^(?:ثبت شروع|شروع)(?:\s+(.+))?$/);
  if (startMatch) {
    const iso = parseDate(startMatch[1] || "امروز", today);
    if (!iso) replies.push(reply("تاریخ شروع را نخواندم. بنویس: شروع ۱۴۰۵/۰۸/۲۷"));
    else {
      const result = addStart(state, iso);
      replies.push(reply(result.error || savedStart(iso)));
    }
    return { state, replies };
  }

  const endMatch = text.match(/^(?:ثبت پایان|پایان)(?:\s+(.+))?$/);
  if (endMatch) {
    const iso = parseDate(endMatch[1] || "امروز", today);
    if (!iso) replies.push(reply("تاریخ پایان را نخواندم."));
    else {
      const result = closeLatest(state, iso);
      replies.push(reply(result.error || savedEnd(result.cycle)));
    }
    return { state, replies };
  }

  const remove = text.match(/^حذف\s+(\d+)$/);
  if (remove) {
    const cycle = findCycle(state, remove[1]);
    if (!cycle) replies.push(reply("این شماره در فهرست نیست. «تاریخ‌ها» را بزن."));
    else replies.push({
      text: `این را پاک کنم؟\n${formatDual(cycle.start)}`,
      inline: { inline_keyboard: [[
        { text: "بله، پاک شود", callback_data: `yesdel:${cycle.id}` },
        { text: "نه", callback_data: "nodel" },
      ]] },
    });
    return { state, replies };
  }

  replies.push(reply("این یکی را نفهمیدم. از دکمه‌ها استفاده کن، یا «راهنما» را بزن."));
  return { state, replies };
}
