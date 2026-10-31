// Sign-in checked in the browser. This site has no server, so these checks stop casual use only.
// The hashes below ship in the public JavaScript, and a weak password can be guessed from its hash.
export type Role = "admin" | "guest";

const CUSTOM_ADMIN = "billfold:access:v1";
const SESSION = "billfold:session";
const ATTEMPTS = "billfold:access-attempts";
const ITERATIONS = 600_000;
export const MIN_PASSWORD = 8;
export const IDLE_LIMIT_MS = 30 * 60_000;

interface Credential { salt: string; hash: string; iterations: number }

const BUILT_IN: Record<Role, Credential> = {
  admin: { salt: "118a7e1288314c72c55ff48bfc429c04", hash: "eb92873cab1d81893b899b907ce955072e2cf0ce50441854377ad3770b3508f1", iterations: ITERATIONS },
  guest: { salt: "a3720678b11a3f63be4150ad5573e422", hash: "0add7105b43d4b48247e084c8df4c1df208bcbf885236adbf2d8e3b34b63e048", iterations: ITERATIONS },
};

const toHex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)));

export const cryptoAvailable = () => typeof crypto !== "undefined" && !!crypto.subtle;

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return toHex(new Uint8Array(bits));
}

async function matches(password: string, c: Credential) {
  const hash = await derive(password, fromHex(c.salt), c.iterations);
  let diff = hash.length ^ c.hash.length;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ c.hash.charCodeAt(i);
  return diff === 0;
}

/** True once the admin has replaced the built-in password in this browser. */
export const hasCustomPassword = () => localStorage.getItem(CUSTOM_ADMIN) !== null;

function customAdmin(): Credential | null {
  try {
    const r = JSON.parse(localStorage.getItem(CUSTOM_ADMIN) ?? "null") as Partial<Credential> | null;
    if (r && typeof r.salt === "string" && typeof r.hash === "string" && typeof r.iterations === "number" && r.iterations >= 1) return r as Credential;
  } catch { /* handled as unreadable below */ }
  return null;
}

/** Returns the role for a correct username and password, otherwise null. */
export async function signIn(username: string, password: string): Promise<Role | null> {
  const name = username.trim().toLowerCase();
  if (name === "guest") return (await matches(password, BUILT_IN.guest)) ? "guest" : null;
  if (name !== "admin") return null;
  // An unreadable custom password refuses sign-in, so corrupting it can't restore the built-in one.
  if (hasCustomPassword()) {
    const custom = customAdmin();
    return custom && (await matches(password, custom)) ? "admin" : null;
  }
  return (await matches(password, BUILT_IN.admin)) ? "admin" : null;
}

export async function setAdminPassword(password: string) {
  if (password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters.`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  localStorage.setItem(CUSTOM_ADMIN, JSON.stringify({ salt: toHex(salt), hash, iterations: ITERATIONS }));
  localStorage.removeItem(ATTEMPTS);
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
  return s === "guest" || s === "admin" ? s : null;
}
export const writeSession = (role: Role) => sessionStorage.setItem(SESSION, role);
export const clearSession = () => sessionStorage.removeItem(SESSION);
export const removeCustomPassword = () => { localStorage.removeItem(CUSTOM_ADMIN); localStorage.removeItem(ATTEMPTS); };
