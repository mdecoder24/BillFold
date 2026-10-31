// Device-level access. This site has no server, so these checks stop casual use on a shared
// browser. They can't stop someone with developer tools, because the data isn't encrypted.
export type Role = "admin" | "guest";

const RECORD = "billfold:access:v1";
const SESSION = "billfold:session";
const ATTEMPTS = "billfold:access-attempts";
const ITERATIONS = 600_000;
export const MIN_PASSCODE = 8;
export const IDLE_LIMIT_MS = 30 * 60_000;

interface AccessRecord { salt: string; hash: string; iterations: number }

const toHex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)));

export const cryptoAvailable = () => typeof crypto !== "undefined" && !!crypto.subtle;

async function derive(passcode: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(passcode), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return toHex(new Uint8Array(bits));
}

/** A record that exists but can't be read still counts as set, so corrupting it can't reopen first-time setup. */
export const hasPasscode = () => localStorage.getItem(RECORD) !== null;

function readRecord(): AccessRecord | null {
  try {
    const r = JSON.parse(localStorage.getItem(RECORD) ?? "null") as Partial<AccessRecord> | null;
    if (r && typeof r.salt === "string" && typeof r.hash === "string" && typeof r.iterations === "number" && r.iterations >= 1) return r as AccessRecord;
  } catch { /* handled as unreadable below */ }
  return null;
}

export async function setPasscode(passcode: string) {
  if (passcode.length < MIN_PASSCODE) throw new Error(`Use at least ${MIN_PASSCODE} characters.`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(passcode, salt, ITERATIONS);
  localStorage.setItem(RECORD, JSON.stringify({ salt: toHex(salt), hash, iterations: ITERATIONS }));
  localStorage.removeItem(ATTEMPTS);
}

export async function checkPasscode(passcode: string) {
  const record = readRecord();
  if (!record) return false;
  const hash = await derive(passcode, fromHex(record.salt), record.iterations);
  let diff = hash.length ^ record.hash.length;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ record.hash.charCodeAt(i);
  return diff === 0;
}

function readAttempts() {
  try {
    const a = JSON.parse(localStorage.getItem(ATTEMPTS) ?? "null") as { count?: unknown; until?: unknown } | null;
    return { count: typeof a?.count === "number" ? a.count : 0, until: typeof a?.until === "number" ? a.until : 0 };
  } catch {
    return { count: 0, until: 0 };
  }
}
/** Seconds to wait before another attempt. */
export const lockoutSeconds = () => Math.max(0, Math.ceil((readAttempts().until - Date.now()) / 1000));
export function recordFailure() {
  const count = readAttempts().count + 1;
  // The first three tries are free, then the wait doubles up to five minutes.
  const wait = count > 3 ? Math.min(300, 2 ** (count - 3) * 5) : 0;
  localStorage.setItem(ATTEMPTS, JSON.stringify({ count, until: Date.now() + wait * 1000 }));
}
export const clearFailures = () => localStorage.removeItem(ATTEMPTS);

/** Lasts for this tab only, so closing the tab signs out. */
export function readSession(): Role | null {
  const s = sessionStorage.getItem(SESSION);
  if (s === "guest") return "guest";
  return s === "admin" && hasPasscode() ? "admin" : null;
}
export const writeSession = (role: Role) => sessionStorage.setItem(SESSION, role);
export const clearSession = () => sessionStorage.removeItem(SESSION);
export const removePasscode = () => { localStorage.removeItem(RECORD); localStorage.removeItem(ATTEMPTS); };
