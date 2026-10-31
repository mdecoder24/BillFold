import {
  DOC_TYPES, NUMBER_PREFIX, blankCompany, normalizeCompany, normalizeDoc, normalizeProduct,
  type Company, type Doc, type DocType, type Product,
} from "./model";

const K = {
  business: "billfold:business:v1",
  clients: "billfold:clients:v1",
  products: "billfold:products:v1",
  recovery: "billfold:recovery",
  template: (t: DocType) => `billfold:template:${t}:v1`,
  draft: (t: DocType) => `billfold:draft:${t}:v1`,
};

const DB = "billfold";
const STORE = "documents";
const MAX_LIBRARY = 1000;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function withStore<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function listDocs(): Promise<Doc[]> {
  const rows = await withStore("readonly", (s) => s.getAll());
  return rows.map((r) => normalizeDoc(r)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function getDoc(id: string): Promise<Doc | null> {
  const row = await withStore("readonly", (s) => s.get(id));
  return row ? normalizeDoc(row) : null;
}
export async function putDoc(doc: Doc): Promise<Doc> {
  const saved = { ...doc, id: doc.id || crypto.randomUUID(), updatedAt: new Date().toISOString() };
  await withStore("readwrite", (s) => s.put(saved));
  return saved;
}
export const deleteDoc = (id: string) => withStore("readwrite", (s) => s.delete(id));

/** The financial year runs April to March, written like 26-27. */
export function financialYear(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

export function numberHead(type: DocType, company: Company, date: string) {
  const prefix = (type === "invoice" && company.settings.prefix) || NUMBER_PREFIX[type];
  return company.settings.numbering === "fy" ? `${prefix}/${financialYear(date)}/` : `${prefix}-`;
}

export async function nextNumber(type: DocType, date = new Date().toISOString().slice(0, 10)): Promise<string> {
  let company = blankCompany();
  try { company = loadCompany() ?? company; } catch { /* a broken profile falls back to plain numbering */ }
  const head = numberHead(type, company, date);
  let max = 0;
  try {
    for (const d of await listDocs()) {
      if (d.docType === type && d.meta.number.startsWith(head)) {
        const n = Number(d.meta.number.slice(head.length));
        if (Number.isInteger(n) && n > max) max = n;
      }
    }
  } catch {
    // Storage unavailable: start numbering from 1.
  }
  return `${head}${String(max + 1).padStart(4, "0")}`;
}

const readJson = (s: Storage, key: string): unknown => {
  const raw = s.getItem(key);
  return raw ? JSON.parse(raw) : null;
};

export type Client = Doc["client"] & { id: string };

export function loadCompany(): Company | null {
  const raw = readJson(localStorage, K.business);
  return raw ? normalizeCompany(raw) : null;
}
export const saveCompany = (company: Company) => localStorage.setItem(K.business, JSON.stringify(company));

/** Starts a document from the company's details and defaults. */
export function applyCompany(doc: Doc, company: Company): Doc {
  const days = company.settings.paymentDays;
  const usesDueDays = ["invoice", "debit-note"].includes(doc.docType);
  const due = usesDueDays && days !== null ? new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10) : doc.meta.due;
  return {
    ...doc, business: company.business, bank: company.bank, template: company.template, design: company.design,
    terms: company.terms, notes: company.notes, footer: company.footer,
    meta: { ...doc.meta, currency: company.currency, paper: company.paper, due },
  };
}

const cleanClient = (c: { id?: unknown }): Client => ({
  ...normalizeDoc({ client: c }).client,
  id: typeof c?.id === "string" ? c.id : crypto.randomUUID(),
});
export function loadClients(): Client[] {
  const raw = readJson(localStorage, K.clients);
  return Array.isArray(raw) ? raw.slice(0, MAX_LIBRARY).map(cleanClient) : [];
}
export const saveClients = (clients: Client[]) => localStorage.setItem(K.clients, JSON.stringify(clients));

export function loadProducts(): Product[] {
  const raw = readJson(localStorage, K.products);
  return Array.isArray(raw) ? raw.slice(0, MAX_LIBRARY).map(normalizeProduct) : [];
}
export const saveProducts = (products: Product[]) => localStorage.setItem(K.products, JSON.stringify(products));

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Saving a document remembers its client and items, so they autocomplete next time. */
export function rememberFromDoc(doc: Doc) {
  if (doc.client.organization.trim()) {
    const clients = loadClients();
    const at = clients.findIndex((c) => same(c.organization, doc.client.organization));
    if (at >= 0) clients[at] = { ...doc.client, id: clients[at].id };
    else clients.push({ ...doc.client, id: crypto.randomUUID() });
    saveClients(clients.slice(0, MAX_LIBRARY));
  }
  const products = loadProducts();
  for (const it of doc.items) {
    if (!it.description.trim()) continue;
    const row = normalizeProduct(it);
    const at = products.findIndex((p) => same(p.description, it.description));
    if (at >= 0) products[at] = { ...row, id: products[at].id };
    else products.push({ ...row, id: crypto.randomUUID() });
  }
  saveProducts(products.slice(0, MAX_LIBRARY));
}

export const recoveryOn = () => localStorage.getItem(K.recovery) === "true";
export function setRecovery(on: boolean) {
  if (on) localStorage.setItem(K.recovery, "true");
  else {
    localStorage.removeItem(K.recovery);
    for (const t of Object.keys(DOC_TYPES) as DocType[]) localStorage.removeItem(K.draft(t));
  }
}
export function writeDraft(doc: Doc) {
  const json = JSON.stringify(doc);
  sessionStorage.setItem(K.draft(doc.docType), json);
  if (recoveryOn()) localStorage.setItem(K.draft(doc.docType), json);
}
export function readDraft(type: DocType): Doc | null {
  const raw = readJson(sessionStorage, K.draft(type)) ?? (recoveryOn() ? readJson(localStorage, K.draft(type)) : null);
  return raw ? normalizeDoc(raw, type) : null;
}
export function clearDraft(type: DocType) {
  sessionStorage.removeItem(K.draft(type));
  localStorage.removeItem(K.draft(type));
}

export const writeTemplate = (doc: Doc) => localStorage.setItem(K.template(doc.docType), JSON.stringify(doc));
export function readTemplate(type: DocType): Doc | null {
  const raw = readJson(localStorage, K.template(type));
  return raw ? normalizeDoc(raw, type) : null;
}

/** Removes the company, clients, products, templates and drafts. Saved documents are kept. */
export function clearLocalData() {
  for (const key of [K.business, K.clients, K.products, K.recovery]) localStorage.removeItem(key);
  for (const t of Object.keys(DOC_TYPES) as DocType[]) {
    localStorage.removeItem(K.template(t));
    localStorage.removeItem(K.draft(t));
    sessionStorage.removeItem(K.draft(t));
  }
}

export async function exportBackup(): Promise<string> {
  return JSON.stringify({
    app: "billfold", version: 2, exportedAt: new Date().toISOString(), documents: await listDocs(), business: loadCompany(),
    clients: loadClients(), products: loadProducts(), templates: (Object.keys(DOC_TYPES) as DocType[]).map(readTemplate).filter(Boolean),
  }, null, 2);
}
export async function importBackup(text: string): Promise<number> {
  const data = JSON.parse(text) as { app?: unknown; documents?: unknown; business?: unknown; clients?: unknown; products?: unknown; templates?: unknown };
  if (data?.app !== "billfold" || !Array.isArray(data.documents)) throw new Error("This isn't a Billfold backup file.");
  let count = 0;
  for (const row of data.documents.slice(0, 5000)) {
    const doc = normalizeDoc(row);
    if (!doc.id) continue;
    await withStore("readwrite", (s) => s.put(doc));
    count++;
  }
  if (data.business) saveCompany(normalizeCompany(data.business));
  if (Array.isArray(data.clients)) saveClients(data.clients.slice(0, MAX_LIBRARY).map(cleanClient));
  if (Array.isArray(data.products)) saveProducts(data.products.slice(0, MAX_LIBRARY).map(normalizeProduct));
  if (Array.isArray(data.templates)) {
    for (const row of data.templates.slice(0, Object.keys(DOC_TYPES).length)) writeTemplate(normalizeDoc(row));
  }
  return count;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function fileToImage(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPEG or WebP image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Choose an image smaller than 8 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * k));
    canvas.height = Math.max(1, Math.round(img.height * k));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing isn't available in this browser.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.88);
    if (data.length > 350_000) throw new Error("This image is too detailed. Choose a smaller one.");
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function addDaysTo(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
