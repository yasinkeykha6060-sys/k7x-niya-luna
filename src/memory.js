import { PARTNER_USERNAME, cleanUsername, migrate } from "./logic.js";

function fingerprint(state) {
  const copy = structuredClone(state);
  delete copy.revision;
  return JSON.stringify(copy);
}

function mergeUser(left, right) {
  if (!left) return structuredClone(right);
  if (!right) return structuredClone(left);
  const gone = {};
  for (const source of [left.gone || {}, right.gone || {}]) {
    for (const [id, rev] of Object.entries(source)) gone[id] = Math.max(gone[id] || 0, Number(rev) || 0);
  }
  let nextId = Math.max(Number(left.nextId) || 1, Number(right.nextId) || 1);
  const chosen = new Map();
  for (const cycle of [...(left.cycles || []), ...(right.cycles || [])]) {
    const copy = { ...cycle, id: String(cycle.id) };
    const current = chosen.get(copy.id);
    if (!current) {
      chosen.set(copy.id, copy);
      continue;
    }
    const copyRev = Number(copy.rev) || 0;
    const currentRev = Number(current.rev) || 0;
    if (current.start !== copy.start && copyRev === currentRev) {
      copy.id = String(nextId);
      nextId += 1;
      chosen.set(copy.id, copy);
      continue;
    }
    if (copyRev >= currentRev) chosen.set(copy.id, copy);
  }
  const cycles = [...chosen.values()].filter((cycle) => {
    const erased = gone[cycle.id];
    if (!erased) return true;
    return (Number(cycle.rev) || 0) > erased;
  });
  const maxId = cycles.reduce((max, cycle) => Math.max(max, Number(cycle.id) || 0), 0);
  const leftRev = Number(left.rev) || 0;
  const rightRev = Number(right.rev) || 0;
  return {
    nextId: Math.max(nextId, maxId + 1),
    cycles,
    pending: leftRev >= rightRev ? (left.pending || null) : (right.pending || null),
    sent: { ...(right.sent || {}), ...(left.sent || {}) },
    tipCursor: Math.max(Number(left.tipCursor) || 0, Number(right.tipCursor) || 0),
    welcomed: Boolean(left.welcomed || right.welcomed),
    rev: Math.max(leftRev, rightRev),
    gone,
  };
}

export function mergeJournals(local, remote) {
  const left = migrate(structuredClone(local || {}));
  const right = migrate(structuredClone(remote || {}));
  const users = {};
  for (const id of new Set([...Object.keys(left.users || {}), ...Object.keys(right.users || {})])) {
    users[id] = mergeUser(left.users[id], right.users[id]);
  }
  const homeName = cleanUsername(left.homeUsername || right.homeUsername || process.env.HOME_USERNAME || "");
  const home = [left, right].find((side) => side.homeChatId && side.users?.[side.homeChatId]?.cycles?.length)?.homeChatId
    || left.homeChatId
    || right.homeChatId
    || null;
  const merged = {
    version: 2,
    offset: Math.max(Number(left.offset) || 0, Number(right.offset) || 0),
    revision: Math.max(Number(left.revision) || 0, Number(right.revision) || 0),
    users,
    homeChatId: home ? String(home) : null,
    homeUsername: homeName,
    partner: { username: PARTNER_USERNAME, chatId: left.partner?.chatId || right.partner?.chatId || null },
    partnerQueue: [...(right.partnerQueue || []), ...(left.partnerQueue || [])].slice(-30),
  };
  if (fingerprint(merged) !== fingerprint(left) && fingerprint(merged) !== fingerprint(right)) merged.revision += 1;
  return merged;
}
