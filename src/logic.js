import { renderCalendar } from "./calendar.js";
import { forecast, openCycle } from "./cycle.js";
import { formatDual, formatJalali, parseDate, tehranToday, toJalali } from "./dates.js";
import { searchHint, searchKnowledge } from "./knowledge.js";
import { MEDICINE_URL, petName, phaseOf, savedEnd, savedStart, statusText, tip, welcome } from "./phrases.js";

export const PARTNER_USERNAME = "yasin48844";

export function cleanUsername(value) {
  return String(value || "").replace(/^@/, "").trim().toLowerCase();
}

function partnerChatIds() {
  return String(process.env.PARTNER_CHAT_ID || "")
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function emptyState() {
  return {
    version: 2,
    offset: 0,
    revision: 0,
    users: {},
    homeChatId: null,
    homeUsername: cleanUsername(process.env.HOME_USERNAME || ""),
    partner: { username: PARTNER_USERNAME, chatId: null },
    partnerQueue: [],
  };
}

function ensureWatch(state) {
  if (!state.partner || typeof state.partner !== "object") state.partner = { username: PARTNER_USERNAME, chatId: null };
  state.partner.username = PARTNER_USERNAME;
  if (state.partner.chatId) state.partner.chatId = String(state.partner.chatId);
  if (!Array.isArray(state.partnerQueue)) state.partnerQueue = [];
  if (state.homeChatId) state.homeChatId = String(state.homeChatId);
  if (state.homeChatId && state.homeChatId === state.partner.chatId) state.homeChatId = null;
  const fromEnv = cleanUsername(process.env.HOME_USERNAME || "");
  state.homeUsername = cleanUsername(state.homeUsername || fromEnv);
  return state;
}

export function partnerPanel(journalId) {
  const id = String(journalId);
  return {
    inline_keyboard: [[
      { text: "وضعیت", callback_data: `p:status:${id}` },
      { text: "تقویم", callback_data: `p:cal:${id}` },
      { text: "تاریخ‌ها", callback_data: `p:dates:${id}` },
    ]],
  };
}

function blankUser() {
  return {
    nextId: 1,
    cycles: [],
    pending: null,
    sent: {},
    tipCursor: 0,
    welcomed: false,
    rev: 0,
    gone: {},
    username: "",
    firstName: "",
    lastName: "",
  };
}

export function displayName(user, chatId) {
  const first = String(user?.firstName || "").trim();
  const last = String(user?.lastName || "").trim();
  const full = `${first} ${last}`.trim();
  const handle = cleanUsername(user?.username);
  if (full && handle) return `${full} (@${handle})`;
  if (full) return full;
  if (handle) return `@${handle}`;
  return `کاربر ${chatId}`;
}

function touchProfile(user, event) {
  if (cleanUsername(event.username)) user.username = cleanUsername(event.username);
  if (event.firstName) user.firstName = String(event.firstName).trim().slice(0, 64);
  if (event.lastName) user.lastName = String(event.lastName).trim().slice(0, 64);
}

function findByUsername(state, name) {
  const want = cleanUsername(name);
  if (!want) return null;
  for (const [id, user] of Object.entries(state.users || {})) {
    if (cleanUsername(user.username) === want) return id;
  }
  return null;
}

function pickJournal(state) {
  if (state.homeChatId && state.users[state.homeChatId]) return String(state.homeChatId);
  const byName = findByUsername(state, state.homeUsername);
  if (byName) return byName;
  const ids = Object.keys(state.users || {})
    .filter((id) => id !== state.partner?.chatId && state.users[id]?.cycles?.length);
  if (!ids.length) return null;
  return ids.sort((left, right) => {
    const a = state.users[left].cycles[state.users[left].cycles.length - 1]?.start || "";
    const b = state.users[right].cycles[state.users[right].cycles.length - 1]?.start || "";
    return b.localeCompare(a);
  })[0];
}

function whoLabel(user, chatId) {
  return displayName(user, chatId);
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
    return ensureWatch(raw);
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
      username: "",
    };
  }
  const offset = Number(raw.offset) || 0;
  for (const key of Object.keys(raw)) delete raw[key];
  raw.version = 2;
  raw.offset = offset;
  raw.users = users;
  return ensureWatch(raw);
}

function userOf(state, chatId) {
  const key = String(chatId);
  if (!state.users[key]) state.users[key] = blankUser();
  return state.users[key];
}

export const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "ثبت شروع" }, { text: "ثبت پایان" }],
    [{ text: "تاریخ دستی" }, { text: "تاریخ‌ها" }],
    [{ text: "وضعیت" }, { text: "تقویم" }],
    [{ text: "نکته" }, { text: "جستجو" }],
    [{ text: "داروها" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

export const PARTNER_KEYBOARD = {
  keyboard: [
    [{ text: "کاربران" }, { text: "وضعیت" }],
    [{ text: "تقویم" }, { text: "تاریخ‌ها" }],
    [{ text: "ثبت شروع" }, { text: "ثبت پایان" }],
    [{ text: "تاریخ دستی" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

function manualDateMenu() {
  return {
    inline_keyboard: [[
      { text: "شروع با تاریخ دیگر", callback_data: "m:start" },
      { text: "پایان با تاریخ دیگر", callback_data: "m:end" },
    ]],
  };
}

function reply(text, extra = {}) {
  return {
    text,
    keyboard: extra.inline ? undefined : (extra.partner ? PARTNER_KEYBOARD : MAIN_KEYBOARD),
    inline: extra.inline,
  };
}

function partnerReply(text, extra = {}) {
  return reply(text, { ...extra, partner: true });
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

function isPartner(event, state = {}) {
  if (cleanUsername(event.username) === PARTNER_USERNAME) return true;
  if (state.partner?.chatId && String(event.chatId) === String(state.partner.chatId)) return true;
  if (partnerChatIds().includes(String(event.chatId))) return true;
  return false;
}

function usersList(state) {
  const ids = Object.keys(state.users || {})
    .filter((id) => id !== String(state.partner?.chatId || ""))
    .sort((left, right) => {
      const a = displayName(state.users[left], left);
      const b = displayName(state.users[right], right);
      return a.localeCompare(b, "fa");
    });
  if (!ids.length) {
    return partnerReply("هنوز کسی ثبت نکرده. به محض ثبت، با اسم اینجا می‌آید و در همین فهرست دیده می‌شود.");
  }
  const lines = ids.map((id) => {
    const user = state.users[id];
    const marks = user.cycles?.length || 0;
    const open = openCycle(user.cycles || []) ? " · باز" : "";
    const focus = String(state.homeChatId) === String(id) ? " · انتخاب‌شده" : "";
    return `${displayName(user, id)} · ${marks} ثبت${open}${focus}`;
  });
  const inline = {
    inline_keyboard: ids.map((id) => {
      const title = displayName(state.users[id], id).slice(0, 60);
      return [{ text: title, callback_data: `u:${id}` }];
    }),
  };
  return partnerReply(`کاربران دفترچه:\n${lines.join("\n")}\nیکی را از دکمه‌ها انتخاب کن.`, { inline });
}

function flushQueue(state, replies) {
  const waiting = state.partnerQueue.splice(0, state.partnerQueue.length);
  for (const note of waiting) replies.push(partnerReply(note));
}

function changeNote(beforeMap, user, byPartner, who) {
  const after = new Map(user.cycles.map((cycle) => [cycle.id, cycle]));
  const lines = [];
  for (const [id, prev] of beforeMap) {
    const cycle = after.get(id);
    if (!cycle) lines.push(`حذف شد: ${formatDual(prev.start)}`);
    else if (JSON.stringify({ ...prev, rev: undefined }) !== JSON.stringify({ ...cycle, rev: undefined })) {
      const end = cycle.end ? ` تا ${formatJalali(cycle.end)}` : "، هنوز باز";
      lines.push(`عوض شد: ${formatDual(cycle.start)}${end}`);
    }
  }
  for (const [id, cycle] of after) {
    if (beforeMap.has(id)) continue;
    const end = cycle.end ? ` تا ${formatJalali(cycle.end)}` : "";
    lines.push(`ثبت شد: شروع ${formatDual(cycle.start)}${end}`);
  }
  if (!lines.length) return "";
  const head = byPartner
    ? `یاسین دفترچه‌ی ${who} را عوض کرد.`
    : `ثبت تازه از ${who}.`;
  return `${head}\n${lines.join("\n")}\nدکمه‌ها: وضعیت، تقویم، تاریخ‌ها. تاریخ سفارشی: شروع ۱۴۰۵/۰۸/۲۷`;
}

function listText(user, partnerView) {
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
  const title = partnerView ? "تاریخ‌های این دفترچه، جدیدترها بالا:" : "تاریخ‌های تو، جدیدترها بالا:";
  return { text: `${title}\n${lines.join("\n")}\nبرای اصلاح، دکمه‌ی همان شماره را بزن. تاریخ سفارشی هم می‌توانی بفرستی: شروع ۱۴۰۵/۰۸/۲۷`, inline };
}

function menuButton(text) {
  return ["ثبت شروع", "ثبت پایان", "تاریخ دستی", "وضعیت", "تقویم", "نکته", "جستجو", "تاریخ‌ها", "تاریخها", "داروها", "دارو", "راهنما", "کاربران"].includes(text);
}

export function step(raw, event, now = new Date()) {
  const state = migrate(structuredClone(raw));
  const today = tehranToday(now);
  const chatId = event.chatId;
  const text = norm(event.text || "");
  const data = event.data || "";
  const replies = [];
  const partner = isPartner(event, state);
  if (partner) {
    state.partner.chatId = String(chatId);
    if (String(state.homeChatId) === String(chatId)) state.homeChatId = null;
  } else {
    touchProfile(userOf(state, chatId), event);
  }

  const panel = String(data || "").match(/^p:(status|cal|dates):(\d+)$/);
  if (panel) {
    state.homeChatId = panel[2];
    const map = { status: "وضعیت", cal: "تقویم", dates: "تاریخ‌ها" };
    return step(state, { ...event, data: "", text: map[panel[1]] }, now);
  }

  if (data.startsWith("u:")) {
    if (!partner) return { state, replies: [{ text: "این دکمه مالِ یاسین است.", keyboard: undefined }], copies: [] };
    state.homeChatId = data.slice(2);
    const chosen = userOf(state, state.homeChatId);
    flushQueue(state, replies);
    const name = displayName(chosen, state.homeChatId);
    replies.push(partnerReply(`${name} انتخاب شد.\nوضعیت، تقویم و تاریخ‌ها مالِ همین نفر است.\nبرای تاریخ دیگر «تاریخ دستی» را بزن؛ برای عوض کردن «تاریخ‌ها».`));
    replies.push(partnerReply(statusText(forecast(chosen.cycles, today), today)));
    return { state, replies, copies: [] };
  }

  if (text === "من یاسینم") {
    state.partner.chatId = String(chatId);
    if (String(state.homeChatId) === String(chatId)) state.homeChatId = null;
    flushQueue(state, replies);
    replies.push(partnerReply("شناخته شدی.\nاز این به بعد هر ثبتی با اسم کاربر همین‌جا می‌آید.\nدکمه‌ی «کاربران» فهرست اسم‌ها را نشان می‌دهد."));
    replies.push(usersList(state));
    return { state, replies, copies: [] };
  }

  if (partner && (text === "/start" || text === "شروع دفتر" || text === "کاربران")) {
    flushQueue(state, replies);
    if (text === "/start" || text === "شروع دفتر") {
      replies.push(partnerReply([
        "هر اکانتی که ثبت کند، خبرش با اسم همین‌جا می‌آید.",
        "دکمه‌ی «کاربران» فهرست اسم‌ها را می‌آورد؛ یکی را بزن تا بینشان عوض شوی.",
        "ثبت شروع و ثبت پایان برای امروز است. تاریخ دیگر را از «تاریخ دستی» یا «تاریخ‌ها» بزن.",
      ].join("\n")));
    }
    replies.push(usersList(state));
    return { state, replies, copies: [] };
  }

  const journalId = partner ? pickJournal(state) : String(chatId);
  if (partner && !journalId) {
    flushQueue(state, replies);
    replies.push(partnerReply("هنوز کسی در فهرست نیست. به محض ثبت، با اسم اینجا می‌آید."));
    replies.push(usersList(state));
    return { state, replies, copies: [] };
  }
  if (partner && state.homeChatId) state.homeChatId = String(state.homeChatId);
  else if (partner) state.homeChatId = String(journalId);
  const user = userOf(state, journalId);
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
    const label = whoLabel(user, journalId);
    const note = afterCore === beforeCore ? "" : changeNote(beforeCycles, user, partner, label);
    const copies = [];
    if (note && partner && journalId && String(journalId) !== String(state.partner.chatId)) {
      copies.push({ chatId: journalId, text: note });
    }
    if (note && !partner && String(chatId) !== String(state.partner.chatId)) {
      if (!state.homeChatId) state.homeChatId = String(chatId);
      const packet = {
        text: note,
        inline: {
          inline_keyboard: [
            ...partnerPanel(chatId).inline_keyboard,
            [{ text: "همه کاربران", callback_data: "p:users" }],
          ],
        },
      };
      if (state.partner.chatId) copies.push({ chatId: state.partner.chatId, ...packet });
      else if (state.partnerQueue.length < 30) state.partnerQueue.push(note);
    }
    const out = items.map((item) => {
      if (partner && item.keyboard && !item.inline) return { ...item, keyboard: PARTNER_KEYBOARD };
      return item;
    });
    return { state, replies: out, copies };
  }

  if (data === "p:users") {
    if (!partner) return { state, replies: [{ text: "این دکمه مالِ یاسین است.", keyboard: undefined }], copies: [] };
    flushQueue(state, replies);
    replies.push(usersList(state));
    return { state, replies, copies: [] };
  }

  if (data === "m:start" || data === "m:end") {
    user.pending = { kind: data === "m:start" ? "log-start" : "log-end" };
    const kind = data === "m:start" ? "شروع" : "پایان";
    replies.push(reply(`تاریخ ${kind} را بفرست.\nمثال: دیروز · ۱۴۰۵/۰۸/۲۷ · 27 آبان 1405 · 2026-11-18\nاگر منصرف شدی «بیخیال».`));
    return done(replies);
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
      replies.push(reply("این تاریخ را نخواندم. مثال: امروز · دیروز · ۱۴۰۵/۰۸/۲۷ · 27 آبان 1405 · 2026-11-18"));
      return done(replies);
    }
    if (user.pending.kind === "log-start") {
      user.pending = null;
      const result = addStart(user, iso);
      replies.push(reply(result.error || savedStart(iso)));
      return done(replies);
    }
    if (user.pending.kind === "log-end") {
      user.pending = null;
      const result = closeLatest(user, iso);
      replies.push(reply(result.error || savedEnd(result.cycle)));
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
      "ثبت شروع و ثبت پایان همان روز را می‌نویسند.",
      "تاریخ دیگر: دکمه‌ی «تاریخ دستی». ویرایش و حذف: «تاریخ‌ها».",
      "مثال دستی: دیروز · ۱۴۰۵/۰۸/۲۷ · 27 آبان 1405 · 2026-11-18",
      "تقویم شمسی است. روزهای ثبت‌شده تیک می‌خورند و کنارش میلادی را هم می‌نویسد.",
      "نکته هر بار یک حرف تازه می‌زند. جستجو از یادداشت‌های همین دفترچه جواب می‌دهد.",
      "دفترچه‌ی هر کس جداست. داروها در ربات جدا یادآوری می‌شوند.",
    ].join("\n")));
    return done(replies);
  }

  if (text === "داروها" || text === "دارو") {
    replies.push(reply(`${petName("دارو")}، قرص‌ها و ویتامین‌ها را این ربات یادت می‌آورد تا با این دفترچه قاطی نشود.\n${MEDICINE_URL}`));
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

  if (text === "تاریخ دستی" || text === "/manual") {
    replies.push({
      text: "تاریخ را دستی ثبت کن.\nثبت شروع و ثبت پایان مالِ امروز است؛ اینجا روز دیگر را می‌نویسی.",
      inline: manualDateMenu(),
      keyboard: partner ? PARTNER_KEYBOARD : MAIN_KEYBOARD,
    });
    return done(replies);
  }

  if (text === "تاریخ‌ها" || text === "تاریخها" || text === "/dates") {
    const view = listText(user, partner);
    replies.push({
      text: `${view.text}\nبرای تاریخ تازه با روز دیگر، «تاریخ دستی» را بزن.`,
      inline: view.inline,
      keyboard: partner ? PARTNER_KEYBOARD : MAIN_KEYBOARD,
    });
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
    if (!iso) replies.push(reply("تاریخ شروع را نخواندم. از «تاریخ دستی» بزن یا بنویس: شروع ۱۴۰۵/۰۸/۲۷"));
    else {
      const result = addStart(user, iso);
      replies.push(reply(result.error || savedStart(iso)));
    }
    return done(replies);
  }

  const endMatch = text.match(/^(?:ثبت پایان|پایان)(?:\s+(.+))?$/);
  if (endMatch) {
    const iso = parseDate(endMatch[1] || "امروز", today);
    if (!iso) replies.push(reply("تاریخ پایان را نخواندم. از «تاریخ دستی» بزن یا بنویس: پایان دیروز"));
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
