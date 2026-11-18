import { daysBetween, formatDual, formatJalali, toFaDigits } from "./dates.js";

export const MEDICINE_URL = "https://t.me/Niayesh_media_bot";

function pick(list, seed) {
  const text = String(seed);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = (hash * 33 + text.charCodeAt(index)) >>> 0;
  return list[hash % list.length];
}

export function welcome(returning) {
  if (returning) {
    return "نیایش جان، برگشتی. دفترچه همان‌جاست و تاریخ‌ها سر جایشان مانده‌اند.";
  }
  return [
    "نیایش جان، این دفترچه‌ی ماهِ توست.",
    "هر وقت عادت ماهانه‌ات شروع شد، «ثبت شروع» را بزن و هر وقت تمام شد، «ثبت پایان».",
    "نزدیکش که بشود، آرام یادت می‌آورم. تاریخ‌ها هم شمسی‌اند، هم میلادی، به وقت تهران.",
    "داروها را همان ربات قبلی یادت می‌آورد؛ دکمه‌ی «داروها» تو را می‌برد آنجا.",
  ].join("\n");
}

export function statusText(forecast, today) {
  if (!forecast.last) {
    return "هنوز تاریخی ننوشته‌ایم. روزی که عادت ماهانه‌ات شروع شد «ثبت شروع» را بزن. از روی همان تاریخ‌های خودت، ماه‌های بعد را می‌گویم.";
  }
  const { stats, next, lateDays } = forecast;
  const lines = [
    `آخرین شروع: ${formatDual(forecast.last)}`,
    stats.usedDefaultCycle
      ? "فاصله را فعلاً ۲۸ روز گرفته‌ام، چون هنوز دو شروعِ قابل‌حساب نداریم. این یکی تقریبی است."
      : `فاصله‌ی میانگین: ${toFaDigits(stats.cycleLen)} روز، از روی ${toFaDigits(stats.gaps.length)} فاصله‌ی ثبت‌شده.`,
    stats.usedDefaultPeriod
      ? "طول عادت را فعلاً ۵ روز گرفته‌ام، تا پایانش را هم ثبت کنی."
      : `طول عادت، میانگین ${toFaDigits(stats.periodLen)} روز بوده.`,
  ];
  if (forecast.rolled) lines.push("چند دوره از آخرین ثبت گذشته؛ این تاریخ را با همان فاصله جلو آوردم.");
  if (lateDays > 0) {
    lines.push(`شروعِ حساب‌شده ${formatDual(next)} بود و ${toFaDigits(lateDays)} روز از آن گذشته. عجله نکن؛ خواب، سفر و استرس تاریخ را جابه‌جا می‌کنند.`);
  } else {
    lines.push(`شروع بعدی، حدود ${formatDual(next)}.`);
  }
  if (stats.skipped.length) lines.push("یک فاصله‌ی خیلی کوتاه یا خیلی بلند را در میانگین نیاوردم تا حساب به‌هم نریزد.");
  lines.push(today ? "" : "");
  return lines.filter(Boolean).join("\n");
}

export function savedStart(iso) {
  return `نوشتم، نیایش جان.\nشروع: ${formatDual(iso)}\nاگر این تاریخ نبود، از «تاریخ‌ها» اصلاحش کن.`;
}

export function savedEnd(cycle) {
  return `پایان را هم گذاشتم.\nاز ${formatJalali(cycle.start)} تا ${formatJalali(cycle.end)}.\nتمام شد؛ آرام باش.`;
}

export function reminder(item) {
  const when = formatDual(item.next);
  const approximate = item.approximate ? "\nاین تاریخ هنوز با فاصله‌ی ۲۸ روزه است، چون سابقه‌ات کوتاه است." : "";
  const lines = {
    d3: [
      `نیایش جان، حدود سه روز دیگر ممکن است عادت ماهانه‌ات شروع شود.\n${when}\nکیف آب‌گرم و یک روز خلوت‌تر را از حالا بگذار کنار دستت.${approximate}`,
      `سه روز مانده تا تاریخ احتمالی.\n${when}\nلازم نیست نگران چیدنِ همه‌چیز باشی؛ فقط کمی آهسته‌تر با خودت راه بیا.${approximate}`,
    ],
    d1: [
      `نیایش جان، فردا ممکن است شروع شود.\n${when}\nامشب زودتر بخواب و یک نوشیدنی گرم دم دستت باشد.${approximate}`,
      `فردا را خلوت‌تر بچین، اگر می‌شود.\n${when}\nبدنت دارد خبر می‌دهد، و تو لازم نیست زرنگ‌تر از توانت باشی.${approximate}`,
    ],
    d0: [
      `نیایش جان، امروز همان تاریخ احتمالی است.\n${when}\nاگر شروع شد، «ثبت شروع» را بزن. اگر نشد، هیچ عجله‌ای نیست.${approximate}`,
      `امروز را سبک بردار.\n${when}\nاین فقط یکی از روزهای بدنت است، نه همه‌ی تو.${approximate}`,
    ],
  };
  return pick(lines[item.kind], item.key);
}

export function tip(phase, today) {
  const pools = {
    soon: [
      "این روزها شکلات تلخ، مایعات گرم و یک پیاده‌روی کوتاه از زور زدن بهتر جواب می‌دهد.",
      "اگر کمرت سنگین شده، گرما بیشتر از جمع‌کردنِ خودت به کار می‌آید. یک بطری آب گرم کافی است.",
      "نمک و قهوه را این دو روز کم کن. نفخ معمولاً با همین دو تا آرام‌تر می‌شود.",
    ],
    period: [
      "امروز لازم نیست مفیدترین نسخه‌ی خودت باشی. آب، غذای ساده، و دراز کشیدن هم کار است.",
      "اگر درد داری، گرما را بگذار روی شکم و سرت را پایین نیاور. دردِ معمولی با استراحت کم می‌شود؛ دردِ خیلی تیز مالِ پزشک است.",
      "آهنِ غذا را فراموش نکن: عدس، اسفناج، یا یک تکه‌ی کوچک گوشت. همراهش ویتامین C، مثل نارنج یا فلفل، جذب را بهتر می‌کند.",
    ],
    mid: [
      "این میانه‌ی چرخه معمولاً انرژی‌ات روشن‌تر است. اگر کاری مانده که حالش را داری، همین روزها وقت خوبی است.",
      "خواب این هفته را به‌هم نزن. چرخه‌ی بعدی از همین شب‌ها ساخته می‌شود.",
    ],
    calm: [
      "بدنت تقویمِ خودش را دارد. تو فقط تاریخ‌ها را می‌نویسی؛ لازم نیست هر روز را تفسیر کنی.",
      "یک لیوان آب بیشتر، و یک ساعت خوابِ سر وقت، از خیلی توصیه‌های شلوغ بهتر است.",
      "اگر چیزی غیرعادی دیدی، همان را یادداشت کن. حافظه‌ی درد دقیق نیست، دفترچه دقیق است.",
    ],
  };
  return pick(pools[phase] || pools.calm, `${phase}:${today}`);
}

export function phaseOf(forecast, today) {
  const current = forecast.stats.sorted[forecast.stats.sorted.length - 1];
  if (current && !current.end && today >= current.start && daysBetween(current.start, today) <= 10) return "period";
  if (current?.end && today >= current.start && today <= current.end) return "period";
  if (!forecast.next) return "calm";
  const until = daysBetween(today, forecast.next);
  if (until >= 0 && until <= 3) return "soon";
  const since = daysBetween(forecast.last, today);
  if (since >= 12 && since <= 16) return "mid";
  return "calm";
}
