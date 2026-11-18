import jalaali from "jalaali-js";

const FA = "۰۱۲۳۴۵۶۷۸۹";
const AR = "٠١٢٣٤٥٦٧٨٩";

export const J_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
export const G_MONTHS = ["ژانویه", "فوریه", "مارس", "آوریل", "مه", "ژوئن", "ژوئیه", "اوت", "سپتامبر", "اکتبر", "نوامبر", "دسامبر"];

export function toFaDigits(value) {
  return String(value).replace(/\d/g, (digit) => FA[Number(digit)]);
}

export function toEnDigits(value) {
  return String(value)
    .replace(/[۰-۹]/g, (digit) => String(FA.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(AR.indexOf(digit)));
}

export function pad(number) {
  return String(number).padStart(2, "0");
}

export function iso(gy, gm, gd) {
  return `${gy}-${pad(gm)}-${pad(gd)}`;
}

export function parts(value) {
  const [gy, gm, gd] = value.split("-").map(Number);
  return { gy, gm, gd };
}

export function utc(value) {
  const { gy, gm, gd } = parts(value);
  return Date.UTC(gy, gm - 1, gd);
}

export function addDays(value, days) {
  const date = new Date(utc(value) + days * 86400000);
  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function daysBetween(from, to) {
  return Math.round((utc(to) - utc(from)) / 86400000);
}

export function tehranToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type) => parts.find((part) => part.type === type).value;
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function tehranHour(now = new Date()) {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return Number(hour);
}

export function toJalali(value) {
  const { gy, gm, gd } = parts(value);
  return jalaali.toJalaali(gy, gm, gd);
}

export function toGregorian(jy, jm, jd) {
  const date = jalaali.toGregorian(jy, jm, jd);
  return iso(date.gy, date.gm, date.gd);
}

export function isValidJalali(jy, jm, jd) {
  return jalaali.isValidJalaaliDate(jy, jm, jd);
}

export function monthLength(jy, jm) {
  return jalaali.jalaaliMonthLength(jy, jm);
}

export function formatJalali(value) {
  const date = toJalali(value);
  return `${toFaDigits(date.jd)} ${J_MONTHS[date.jm - 1]} ${toFaDigits(date.jy)}`;
}

export function formatGregorian(value) {
  const { gy, gm, gd } = parts(value);
  return `${toFaDigits(gd)} ${G_MONTHS[gm - 1]} ${toFaDigits(gy)}`;
}

export function formatDual(value) {
  return `${formatJalali(value)} · ${formatGregorian(value)}`;
}

export function currentJalali(now = new Date()) {
  return toJalali(tehranToday(now));
}

function normalizeWords(text) {
  return toEnDigits(text)
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[،,.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseDate(text, today) {
  const clean = normalizeWords(text);
  if (!clean) return null;
  if (clean === "امروز") return today;
  if (clean === "دیروز") return addDays(today, -1);
  if (clean === "فردا") return addDays(today, 1);

  const numeric = clean.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (numeric) {
    const year = Number(numeric[1]);
    const month = Number(numeric[2]);
    const day = Number(numeric[3]);
    if (year > 1700) {
      const value = iso(year, month, day);
      const check = new Date(utc(value));
      if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return null;
      return value;
    }
    if (!isValidJalali(year, month, day)) return null;
    return toGregorian(year, month, day);
  }

  const named = clean.match(/^(\d{1,2})\s+([^\s\d]+)(?:\s+(\d{4}))?$/);
  if (named) {
    const month = J_MONTHS.indexOf(named[2]) + 1;
    if (!month) return null;
    const year = named[3] ? Number(named[3]) : toJalali(today).jy;
    const day = Number(named[1]);
    if (!isValidJalali(year, month, day)) return null;
    return toGregorian(year, month, day);
  }
  return null;
}

export function weekdayColumn(value) {
  const { gy, gm, gd } = parts(value);
  const day = new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay();
  return (day + 1) % 7;
}
