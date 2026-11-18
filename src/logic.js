import { renderCalendar } from "./calendar.js";
import { forecast, openCycle } from "./cycle.js";
import { formatDual, formatJalali, parseDate, tehranToday, toJalali } from "./dates.js";
import { searchHint, searchKnowledge } from "./knowledge.js";
import { MEDICINE_URL, phaseOf, savedEnd, savedStart, statusText, tip, welcome } from "./phrases.js";

export function emptyState() {
  return { version: 2, offset: 0, revision: 0, users: {} };
}

function blankUser() {
  return { nextId: 1, cycles: [], pending: null, sent: {}, tipCursor: 0, welcomed: false, rev: 0, gone: {} };
}

export function migrate(raw) {
  if (!raw || typeof raw !== "object") return emptyState();
  if (raw.users && raw.version === 2) {
    if (typeof raw.offset !== "number") raw.offset = 0;
    if (typeof raw.revision !== "number") raw.revision = 0;
    for (const user of Object.values(raw.users)) {
      if (!user || typeof user !== "object") continue;
      user.cycles = Array.isArray(user.cycles) ? user.cycles : [];
      user.sent = user.sent && typeof user.sent === "object" ? user.sent : {};
      user.gone = user.gone && typeof user.gone === "object" ? user.gone : {};
      user.rev = Number(user.rev) || 0;
      if (!user.nextId) user.nextId = 1;
    }
    return raw;
  }
  const users = {};
  if (raw.ownerChatId) {
    users[String(raw.ownerChatId)] = {
      nextId: raw.nextId || 1,
      cycles: Array.isArray(raw.cycles) ? raw.cycles : [],
      pending: raw.pending || null,
      sent: raw.sent && typeof raw.sent === "object" ? raw.sent : {},
      tipCursor: 0,
      welcomed: true,
      rev: 1,
      gone: {},
    };
  }
  const offset = Number(raw.offset) || 0;
  for (const key of Object.keys(raw)) delete raw[key];
  raw.version = 2;
  raw.offset = offset;
  raw.users = users;
  return raw;
}

function userOf(state, chatId) {
  const key = String(chatId);
  if (!state.users[key]) state.users[key] = blankUser();
  return state.users[key];
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

function findCycle(user, id) {
  return user.cycles.find((cycle) => cycle.id === String(id));
}

function addStart(user, iso) {
  if (openCycle(user.cycles)) return { error: "یک عادت هنوز باز است. اول «ثبت پایان» را بزن، یا از تاریخ‌ها اصلاحش کن. ماه‌های بسته را هر چند بار که بخواهی می‌توانی ثبت کنی." };
  if (user.cycles.some((cycle) => cycle.start === iso)) return { error: "این شروع را قبلاً نوشته‌ام." };
  const cycle = { id: String(user.nextId), start: iso, end: null, note: "" };
  user.nextId += 1;
  user.cycles.push(cycle);
  return { cycle };
}

function closeLatest(user, iso) {
  const cycle = openCycle(user.cycles);
  if (!cycle) return { error: "عادتِ بازی نداریم. اگر شروع را نزده‌ای، اول «ثبت شروع» را بزن." };
  if (iso < cycle.start) return { error: "پایان نمی‌تواند قبل از شروع باشد." };
  cycle.end = iso;
  return { cycle };
}

function listText(user) {
  const cycles = [...user.cycles].sort((a, b) => b.start.localeCompare(a.start)).slice(0, 12);
  if (!cycles.length) return { text: "هنوز تاریخی نیست. هر وقت شروع شد، «ثبت شروع» را بزن.", inline: undefined };
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
  return { text: `تاریخ‌های تو، جدیدترها بالا:\n${lines.join("\n")}\nبرای اصلاح، دکمه‌ی همان شماره را بزن. هر ماه می‌توانی یکی دیگر اضافه کنی.`, inline };
}

function menuButton(text) {
  return ["ثبت شروع", "ثبت پایان", "وضعیت", "تقویم", "نکته", "جستجو", "تاریخ‌ها", "تاریخها", "داروها", "دارو", "راهنما"].includes(text);
}

export function step(raw, event, now = new Date()) {
  const state = migrate(structuredClone(raw));
  const today = tehranToday(now);
  const chatId = event.chatId;
  const text = norm(event.text || "");
  const data = event.data || "";
  const replies = [];
  const user = userOf(state, chatId);
  const beforeIds = new Set(user.cycles.map((cycle) => cycle.id));
  const beforeCycles = new Map(user.cycles.map((cycle) => [cycle.id, { ...cycle }]));
  const beforeCore = JSON.stringify({
    cycles: user.cycles.map(({ rev, ...cycle }) => cycle),
    pending: user.pending,
    sent: user.sent,
    tipCursor: user.tipCursor,
    welcomed: user.welcomed,
    nextId: user.nextId,
  });

  function done(items) {
    const afterCore = JSON.stringify({
      cycles: user.cycles.map(({ rev, ...cycle }) => cycle),
      pending: user.pending,
      sent: user.sent,
      tipCursor: user.tipCursor,
      welcomed: user.welcomed,
      nextId: user.nextId,
    });
    if (afterCore !== beforeCore) {
      user.rev = (Number(user.rev) || 0) + 1;
      user.gone = user.gone || {};
      for (const id of beforeIds) {
        if (!user.cycles.some((cycle) => cycle.id === id)) user.gone[id] = user.rev;
      }
      for (const cycle of user.cycles) {
        const prev = beforeCycles.get(cycle.id);
        const body = JSON.stringify({ ...cycle, rev: undefined });
        const prevBody = prev ? JSON.stringify({ ...prev, rev: undefined }) : null;
        if (body !== prevBody) cycle.rev = user.rev;
      }
    }
    return { state, replies: items };
  }

  if (data.startsWith("cal:")) {
    const [, year, month] = data.split(":");
    const view = renderCalendar(user.cycles, Number(year), Number(month), today);
    replies.push({ text: view.text, inline: view.inline });
    return done(replies);
  }

  if (data.startsWith("del:")) {
    const cycle = findCycle(user, data.slice(4));
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
    return done(replies);
  }

  if (data.startsWith("yesdel:")) {
    const id = data.slice(7);
    const before = user.cycles.length;
    user.cycles = user.cycles.filter((cycle) => cycle.id !== id);
    replies.push(reply(user.cycles.length === before ? "قبلاً پاک شده بود." : "پاک شد. تقویم هم با همین حساب تازه می‌شود. هر وقت خواستی دوباره ثبت کن."));
    return done(replies);
  }

  if (data === "nodel") {
    replies.push(reply("باشد، دست نزدم."));
    return done(replies);
  }

  if (data.startsWith("edits:") || data.startsWith("edite:")) {
    const kind = data.startsWith("edits:") ? "edit-start" : "edit-end";
    const id = data.split(":")[1];
    if (!findCycle(user, id)) replies.push(reply("این شماره را پیدا نکردم."));
    else {
      user.pending = { kind, id };
      replies.push(reply("تاریخ تازه را بفرست. مثلاً ۱۴۰۵/۰۸/۲۷ یا 2026-11-18 یا امروز. اگر منصرف شدی، «بیخیال» را بنویس."));
    }
    return done(replies);
  }

  if (text === "بیخیال") {
    user.pending = null;
    replies.push(reply("باشد. هیچ‌چیز عوض نشد."));
    return done(replies);
  }

  if (text === "آزادش کن") {
    user.pending = null;
    replies.push(reply("دفترچه قفل نیست. هر کس از گوشی خودش دفترچه‌ی جدا دارد و هر ماه می‌تواند دوباره ثبت کند. برای پاک کردن یک تاریخ، «تاریخ‌ها» را بزن."));
    return done(replies);
  }

  if (menuButton(text)) user.pending = null;

  if (user.pending && !text.startsWith("/")) {
    if (user.pending.kind === "search") {
      user.pending = null;
      replies.push(reply(searchKnowledge(text) || `برای «${esc(text)}» یادداشت آماده‌ای ندارم.\n${searchHint()}`));
      return done(replies);
    }
    const iso = parseDate(text, today);
    if (!iso) {
      replies.push(reply("این تاریخ را نخواندم. یک بار دیگر، مثل ۱۴۰۵/۰۸/۲۷ یا ۲۷ آبان ۱۴۰۵."));
      return done(replies);
    }
    const cycle = findCycle(user, user.pending.id);
    if (!cycle) {
      user.pending = null;
      replies.push(reply("آن مورد دیگر در دفترچه نیست."));
      return done(replies);
    }
    if (user.pending.kind === "edit-start") {
      if (cycle.end && iso > cycle.end) replies.push(reply("شروع بعد از پایان نمی‌شود."));
      else {
        cycle.start = iso;
        user.pending = null;
        replies.push(reply(`شروع را عوض کردم: ${formatDual(iso)}`));
      }
    } else {
      if (iso < cycle.start) replies.push(reply("پایان قبل از شروع نمی‌شود."));
      else {
        cycle.end = iso;
        user.pending = null;
        replies.push(reply(`پایان را عوض کردم: ${formatDual(iso)}`));
      }
    }
    return done(replies);
  }

  if (text === "/start" || text === "شروع دفتر") {
    const returning = user.welcomed || user.cycles.length > 0;
    user.welcomed = true;
    replies.push(reply(welcome(returning)));
    return done(replies);
  }

  if (text === "راهنما" || text === "/help") {
    user.welcomed = true;
    replies.push(reply([
      "ثبت شروع و ثبت پایان، برای امروز. هر ماه می‌توانی یکی دیگر بنویسی.",
      "اگر تاریخ دیگری است: شروع ۱۴۰۵/۰۸/۲۷ یا پایان دیروز.",
      "تاریخ‌ها را می‌شود ویرایش یا حذف کرد.",
      "تقویم شمسی است. روزهای ثبت‌شده تیک می‌خورند و کنارش میلادی را هم می‌نویسد.",
      "نکته هر بار یک حرف تازه می‌زند. جستجو از یادداشت‌های همین دفترچه جواب می‌دهد.",
      "دفترچه‌ی هر کس جداست. داروها در ربات جدا یادآوری می‌شوند.",
    ].join("\n")));
    return done(replies);
  }

  if (text === "داروها" || text === "دارو") {
    replies.push(reply(`جان، قرص‌ها و ویتامین‌ها را همان ربات قبلی یادت می‌آورد تا با این دفترچه قاطی نشود.\n${MEDICINE_URL}`));
    return done(replies);
  }

  if (text === "وضعیت" || text === "/status") {
    replies.push(reply(statusText(forecast(user.cycles, today), today)));
    return done(replies);
  }

  if (text === "نکته" || text === "/tip") {
    const cast = forecast(user.cycles, today);
    const cursor = user.tipCursor || 0;
    user.tipCursor = cursor + 1;
    replies.push(reply(tip(phaseOf(cast, today), cursor)));
    return done(replies);
  }

  if (text === "تقویم" || text === "/calendar") {
    const nowJ = toJalali(today);
    const view = renderCalendar(user.cycles, nowJ.jy, nowJ.jm, today);
    replies.push({ text: view.text, inline: view.inline, keyboard: MAIN_KEYBOARD });
    return done(replies);
  }

  if (text === "تاریخ‌ها" || text === "تاریخها" || text === "/dates") {
    const view = listText(user);
    replies.push({ text: view.text, inline: view.inline, keyboard: MAIN_KEYBOARD });
    return done(replies);
  }

  if (text === "جستجو" || text === "/search") {
    user.pending = { kind: "search" };
    replies.push(reply(searchHint()));
    return done(replies);
  }

  if (text.startsWith("جستجو ")) {
    const query = text.slice("جستجو ".length);
    replies.push(reply(searchKnowledge(query) || `برای «${esc(query)}» یادداشت آماده‌ای ندارم.\n${searchHint()}`));
    return done(replies);
  }

  if (text.startsWith("یادداشت ")) {
    const cycle = [...user.cycles].sort((a, b) => b.start.localeCompare(a.start))[0];
    if (!cycle) replies.push(reply("اول یک تاریخ ثبت کن، بعد یادداشت را بگو."));
    else {
      cycle.note = text.slice("یادداشت ".length).slice(0, 80);
      replies.push(reply(`یادداشت را برای ${formatJalali(cycle.start)} گذاشتم.`));
    }
    return done(replies);
  }

  const startMatch = text.match(/^(?:ثبت شروع|شروع)(?:\s+(.+))?$/);
  if (startMatch) {
    const iso = parseDate(startMatch[1] || "امروز", today);
    if (!iso) replies.push(reply("تاریخ شروع را نخواندم. بنویس: شروع ۱۴۰۵/۰۸/۲۷"));
    else {
      const result = addStart(user, iso);
      replies.push(reply(result.error || savedStart(iso)));
    }
    return done(replies);
  }

  const endMatch = text.match(/^(?:ثبت پایان|پایان)(?:\s+(.+))?$/);
  if (endMatch) {
    const iso = parseDate(endMatch[1] || "امروز", today);
    if (!iso) replies.push(reply("تاریخ پایان را نخواندم."));
    else {
      const result = closeLatest(user, iso);
      replies.push(reply(result.error || savedEnd(result.cycle)));
    }
    return done(replies);
  }

  const remove = text.match(/^حذف\s+(\d+)$/);
  if (remove) {
    const cycle = findCycle(user, remove[1]);
    if (!cycle) replies.push(reply("این شماره در فهرست نیست. «تاریخ‌ها» را بزن."));
    else replies.push({
      text: `این را پاک کنم؟\n${formatDual(cycle.start)}`,
      inline: { inline_keyboard: [[
        { text: "بله، پاک شود", callback_data: `yesdel:${cycle.id}` },
        { text: "نه", callback_data: "nodel" },
      ]] },
    });
    return done(replies);
  }

  if (!user.welcomed) {
    user.welcomed = true;
    replies.push(reply(welcome(false)));
    return done(replies);
  }

  replies.push(reply("این یکی را نفهمیدم. از دکمه‌ها استفاده کن، یا «راهنما» را بزن."));
  return done(replies);
}
