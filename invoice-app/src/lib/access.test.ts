import { beforeEach, describe, expect, it } from "vitest";
import { blankDoc } from "./model";

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}
beforeEach(() => {
  Object.assign(globalThis, { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() });
});

const access = () => import("./access");
const storage = () => import("./storage");

// The repository is public, so the admin password is never written here. Pass it in to test it:
// BILLFOLD_ADMIN_PASSWORD=... npm test
const builtIn = process.env.BILLFOLD_ADMIN_PASSWORD;

describe("sign-in", () => {
  it.skipIf(!builtIn)("accepts the built-in admin account", async () => {
    const a = await access();
    expect(await a.signIn("admin", builtIn!)).toBe("admin");
    expect(await a.signIn(" Admin ", builtIn!)).toBe("admin");
    expect(await a.signIn("admin", builtIn!.toUpperCase())).toBeNull();
    expect(await a.signIn("guest", builtIn!)).toBeNull();
    expect(await a.signIn("root", builtIn!)).toBeNull();
  });
  it("accepts the guest account", async () => {
    expect(await (await access()).signIn("guest", "guest")).toBe("guest");
  });
  it("refuses wrong details and mixed-up accounts", async () => {
    const a = await access();
    expect(await a.signIn("admin", "wrong")).toBeNull();
    expect(await a.signIn("admin", "guest")).toBeNull();
    expect(await a.signIn("", "")).toBeNull();
  });
  it("a changed password replaces the built-in one", async () => {
    const a = await access();
    await a.setAdminPassword("a much longer one");
    expect(localStorage.getItem("billfold:access:v1")).not.toContain("a much longer one");
    expect(await a.signIn("admin", "a much longer one")).toBe("admin");
    expect(await a.signIn("guest", "guest")).toBe("guest");
  });
  it.skipIf(!builtIn)("a changed or corrupted password shuts out the built-in one", async () => {
    const a = await access();
    await a.setAdminPassword("a much longer one");
    expect(await a.signIn("admin", builtIn!)).toBeNull();
    localStorage.setItem("billfold:access:v1", "{broken");
    expect(await a.signIn("admin", builtIn!)).toBeNull();
  });
  it("rejects a short new password", async () => {
    await expect((await access()).setAdminPassword("short")).rejects.toThrow(/at least 8/);
  });
  it("waits longer after repeated failures", async () => {
    const a = await access();
    for (let i = 0; i < 3; i++) a.recordFailure();
    expect(a.lockoutSeconds()).toBe(0);
    a.recordFailure();
    expect(a.lockoutSeconds()).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) a.recordFailure();
    expect(a.lockoutSeconds()).toBeLessThanOrEqual(300);
  });
  it("ignores an unknown session value", async () => {
    const a = await access();
    sessionStorage.setItem("billfold:session", "root");
    expect(a.readSession()).toBeNull();
  });
});

describe("guest sandbox", () => {
  it("reads nothing saved and can't write", async () => {
    const s = await storage();
    s.setStorageRole("admin");
    s.saveClients([{ ...blankDoc("invoice").client, organization: "Secret Co", id: "1" }]);
    s.writeDraft({ ...blankDoc("invoice"), notes: "admin draft" });
    s.setStorageRole("guest");
    expect(s.loadClients()).toEqual([]);
    expect(s.loadCompany()).toBeNull();
    expect(s.loadProducts()).toEqual([]);
    expect(s.readDraft("invoice")).toBeNull();
    expect(await s.listDocs()).toEqual([]);
    expect(await s.getDoc("1")).toBeNull();
    expect(() => s.saveClients([])).toThrow(/Admin/);
    expect(() => s.saveCompany({} as never)).toThrow(/Admin/);
    expect(() => s.clearLocalData()).toThrow(/Admin/);
    await expect(s.putDoc(blankDoc("invoice"))).rejects.toThrow(/Admin/);
    await expect(s.exportBackup()).rejects.toThrow(/Admin/);
    await expect(s.importBackup("{}")).rejects.toThrow(/Admin/);
  });
  it("keeps guest drafts apart and clears them", async () => {
    const s = await storage();
    s.setStorageRole("guest");
    s.writeDraft({ ...blankDoc("invoice"), notes: "guest draft" });
    expect(s.readDraft("invoice")?.notes).toBe("guest draft");
    s.setStorageRole("admin");
    expect(s.readDraft("invoice")).toBeNull();
    s.setStorageRole("guest");
    s.clearGuestDrafts();
    expect(s.readDraft("invoice")).toBeNull();
  });
});
