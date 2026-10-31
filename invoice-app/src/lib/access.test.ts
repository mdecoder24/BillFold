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

describe("passcode", () => {
  it("stores only a salted hash and verifies correctly", async () => {
    const a = await access();
    await a.setPasscode("correct horse");
    const raw = localStorage.getItem("billfold:access:v1")!;
    expect(raw).not.toContain("correct horse");
    expect(JSON.parse(raw).iterations).toBe(600000);
    expect(await a.checkPasscode("correct horse")).toBe(true);
    expect(await a.checkPasscode("wrong horse")).toBe(false);
  });
  it("uses a different hash each time", async () => {
    const a = await access();
    await a.setPasscode("same passcode");
    const first = localStorage.getItem("billfold:access:v1");
    await a.setPasscode("same passcode");
    expect(localStorage.getItem("billfold:access:v1")).not.toBe(first);
  });
  it("rejects a short passcode", async () => {
    await expect((await access()).setPasscode("short")).rejects.toThrow(/at least 8/);
  });
  it("a corrupted record blocks sign-in and doesn't reopen setup", async () => {
    const a = await access();
    localStorage.setItem("billfold:access:v1", "{broken");
    expect(a.hasPasscode()).toBe(true);
    expect(await a.checkPasscode("anything at all")).toBe(false);
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
  it("an admin session needs a passcode to exist", async () => {
    const a = await access();
    a.writeSession("admin");
    expect(a.readSession()).toBeNull();
    await a.setPasscode("correct horse");
    expect(a.readSession()).toBe("admin");
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
