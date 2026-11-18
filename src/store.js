import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { emptyState } from "./logic.js";

const FILE = "data/state.enc";

export function keyFrom(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex || "")) throw new Error("DATA_KEY باید ۶۴ رقم هگز باشد.");
  return Buffer.from(hex, "hex");
}

export function seal(state, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(state), "utf8"), cipher.final()]);
  return ["v1", iv.toString("hex"), cipher.getAuthTag().toString("hex"), encrypted.toString("hex")].join(":");
}

export function open(payload, key) {
  const [version, iv, tag, data] = String(payload).trim().split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("دفترچه رمزشده خراب است.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  const plain = Buffer.concat([decipher.update(Buffer.from(data, "hex")), decipher.final()]);
  return JSON.parse(plain.toString("utf8"));
}

export function load(hex = process.env.DATA_KEY) {
  if (!existsSync(FILE)) return emptyState();
  return open(readFileSync(FILE, "utf8"), keyFrom(hex));
}

export function save(state, hex = process.env.DATA_KEY) {
  writeFileSync(FILE, `${seal(state, keyFrom(hex))}\n`);
}
