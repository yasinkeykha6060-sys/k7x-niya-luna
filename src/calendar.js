import { J_MONTHS, formatGregorian, toFaDigits, toJalali } from "./dates.js";
import { monthModel } from "./cycle.js";

const HEADS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

function num(jd) {
  return toFaDigits(String(jd).padStart(2, "0"));
}

function cell(day) {
  const mark = day.logged ? "✓" : day.today ? "*" : day.predicted ? "~" : day.pms ? "·" : " ";
  return mark + num(day.jd);
}

export function renderCalendar(cycles, jy, jm, today) {
  const model = monthModel(cycles, jy, jm, today);
  const rows = [HEADS.map((day) => day.padStart(3, " ")).join(" ")];
  let row = "    ".repeat(model.lead);
  model.days.forEach((day, index) => {
    row += cell(day);
    const column = (model.lead + index) % 7;
    if (column === 6) {
      rows.push(row.trimEnd());
      row = "";
    } else row += " ";
  });
  if (row.trim()) rows.push(row.trimEnd());
  const first = model.days[0].iso;
  const last = model.days[model.days.length - 1].iso;
  const logged = model.days.filter((day) => day.logged).map((day) => toFaDigits(day.jd));
  const title = `${J_MONTHS[jm - 1]} ${toFaDigits(jy)}`;
  const span = `از ${formatGregorian(first)} تا ${formatGregorian(last)}`;
  const loggedLine = logged.length ? `تیک‌خورده: ${logged.join("، ")}` : "این ماه هنوز روزی تیک نخورده.";
  const todayDay = model.days.find((day) => day.today);
  const todayLine = todayDay?.logged ? "امروز هم تیک خورده." : "";
  const predict = model.stats.usedDefaultPeriod
    ? "~ فقط روزِ احتمالیِ شروع را نشان می‌دهد، چون هنوز پایانی ثبت نشده."
    : "~ پیش‌بینی است، از روی مدت‌هایی که خودت ثبت کرده‌ای.";
  const nextLine = model.next
    ? `شروع بعدی، حدود ${toFaDigits(toJalali(model.next).jd)} ${J_MONTHS[toJalali(model.next).jm - 1]}.`
    : "با اولین «ثبت شروع»، پیش‌بینی روی تقویم می‌آید.";
  const text = [
    `جان، تقویم ${title}.`,
    span,
    `<pre>${rows.join("\n")}</pre>`,
    "✓ ثبت‌شده    * امروز    · سه روز قبل",
    predict,
    loggedLine,
    todayLine,
    nextLine,
  ].filter(Boolean).join("\n");
  const prev = jm === 1 ? { y: jy - 1, m: 12 } : { y: jy, m: jm - 1 };
  const next = jm === 12 ? { y: jy + 1, m: 1 } : { y: jy, m: jm + 1 };
  return {
    text,
    inline: {
      inline_keyboard: [[
        { text: "ماه قبل", callback_data: `cal:${prev.y}:${prev.m}` },
        { text: "ماه بعد", callback_data: `cal:${next.y}:${next.m}` },
      ]],
    },
  };
}
