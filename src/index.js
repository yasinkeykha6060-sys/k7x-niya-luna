import { execSync } from "node:child_process";
import { mergeJournals } from "./memory.js";
import { migrate } from "./logic.js";
import { keyFrom, load, open, save } from "./store.js";
import { callTelegram } from "./telegram.js";
import { runWatch } from "./watch.js";

const watchSeconds = Number(process.env.WATCH_SECONDS || 0);

function run(command) {
  return execSync(command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

function canon(state) {
  const copy = structuredClone(state);
  delete copy.revision;
  return JSON.stringify(copy);
}

function adopt(state, merged) {
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, merged);
}

function commitFile() {
  run("git add -- data/state.enc");
  try {
    run("git diff --cached --quiet");
  } catch {
    run("git commit -m \"Update journal\"");
  }
}

function remoteJournal() {
  run("git fetch origin main");
  try {
    const payload = run("git --no-pager show origin/main:data/state.enc");
    if (!payload) return null;
    return migrate(open(payload, keyFrom(process.env.DATA_KEY)));
  } catch {
    return null;
  }
}

function pushJournal(state) {
  if (process.env.AUTO_PUSH !== "1") return;
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      commitFile();
      run("git push origin HEAD:main");
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
      const remote = remoteJournal();
      if (!remote) break;
      adopt(state, mergeJournals(state, remote));
      save(state);
      run("git reset --soft origin/main");
    }
  }
  throw lastError;
}

async function main() {
  const state = load();
  const people = Object.keys(state.users || {}).length;
  const marks = Object.values(state.users || {}).reduce((sum, user) => sum + (user.cycles?.length || 0), 0);
  console.log(`دفترچه بار شد. نفرها: ${people}، ثبت‌ها: ${marks}، نسخه: ${state.revision || 0}`);
  let stored = canon(state);
  let pushedRevision = Number(state.revision) || 0;
  let writing = false;
  let stopCode = null;

  function persist(next) {
    if (writing) return;
    writing = true;
    try {
      if (canon(next) !== stored) {
        next.revision = (Number(next.revision) || 0) + 1;
        save(next);
        stored = canon(next);
      }
      if ((Number(next.revision) || 0) !== pushedRevision) {
        pushJournal(next);
        stored = canon(next);
        pushedRevision = Number(next.revision) || 0;
      }
    } catch (error) {
      console.error("فرستادن دفترچه به گیت‌هاب نماند. نسخه‌ی محلی مانده و دوباره فرستاده می‌شود.");
      console.error(error.message);
      throw error;
    } finally {
      writing = false;
      if (stopCode !== null) process.exit(stopCode);
    }
  }

  function flush(code) {
    stopCode = code;
    if (writing) return;
    try { persist(state); } catch { /* already logged */ }
    process.exit(code);
  }

  process.on("SIGTERM", () => flush(0));
  process.on("SIGINT", () => flush(0));

  let result;
  try {
    result = await runWatch({ state, call: callTelegram, watchSeconds, persist });
  } finally {
    try { persist(state); } catch { /* the backup step in GitHub still tries to push */ }
  }
  if (result?.reason === "conflict") process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
