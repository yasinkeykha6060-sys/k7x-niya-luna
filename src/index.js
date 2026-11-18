import { execSync } from "node:child_process";
import { load, save } from "./store.js";
import { callTelegram } from "./telegram.js";
import { runWatch } from "./watch.js";

const watchSeconds = Number(process.env.WATCH_SECONDS || 0);

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

async function main() {
  const state = load();
  let seen = JSON.stringify(state);
  const result = await runWatch({
    state,
    call: callTelegram,
    watchSeconds,
    persist(next) {
      const snap = JSON.stringify(next);
      if (snap === seen) return;
      save(next);
      try { pushJournal(); } catch (error) {
        console.error("دفترچه ذخیره شد ولی فرستادن به گیت‌هاب نماند.");
        console.error(error.message);
      }
      seen = snap;
    },
  });
  if (result?.reason === "conflict") process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
