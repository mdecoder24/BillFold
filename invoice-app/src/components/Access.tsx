"use client";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ShieldCheck, UserRound } from "lucide-react";
import {
  IDLE_LIMIT_MS, MIN_PASSCODE, checkPasscode, clearFailures, clearSession, cryptoAvailable, hasPasscode, lockoutSeconds,
  readSession, recordFailure, removePasscode, setPasscode, writeSession, type Role,
} from "@/lib/access";
import { clearGuestDrafts, eraseEverything, setStorageRole } from "@/lib/storage";
import { Logo } from "./Logo";

interface AccessValue { role: Role; signOut: () => void }
const AccessContext = createContext<AccessValue>({ role: "guest", signOut: () => {} });
export const useAccess = () => useContext(AccessContext);

function SignInForm({ onAdmin, onForgot }: { onAdmin: () => void; onForgot: () => void }) {
  const [passcode, setValue] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const wait = lockoutSeconds();
    if (wait) return setProblem(`Too many tries. Wait ${wait} seconds.`);
    setBusy(true);
    setProblem("");
    try {
      if (await checkPasscode(passcode)) { clearFailures(); onAdmin(); return; }
      recordFailure();
      const next = lockoutSeconds();
      setProblem(next ? `That passcode is wrong. Wait ${next} seconds to try again.` : "That passcode is wrong.");
      setValue("");
    } catch {
      setProblem("The passcode couldn't be checked in this browser.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="access-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="access-passcode">Admin passcode</label>
        <input id="access-passcode" type="password" autoComplete="current-password" autoFocus value={passcode} aria-invalid={!!problem || undefined} onChange={(e) => setValue(e.target.value)} />
      </div>
      {problem && <p role="alert" className="err">{problem}</p>}
      <button type="submit" className="btn primary wide" disabled={busy || !passcode}>{busy ? "Checking…" : "Sign in as admin"}</button>
      <button type="button" className="access-link" onClick={onForgot}>Forgot your passcode?</button>
    </form>
  );
}

export function PasscodeFields({ submitLabel, onDone }: { submitLabel: string; onDone: () => void }) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (first.length < MIN_PASSCODE) return setProblem(`Use at least ${MIN_PASSCODE} characters.`);
    if (first !== second) return setProblem("The two passcodes don't match.");
    setBusy(true);
    try { await setPasscode(first); onDone(); }
    catch { setProblem("The passcode couldn't be saved in this browser."); }
    finally { setBusy(false); }
  };
  return (
    <form className="access-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="new-passcode">New passcode</label>
        <input id="new-passcode" type="password" autoComplete="new-password" value={first} onChange={(e) => setFirst(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="confirm-passcode">Repeat passcode</label>
        <input id="confirm-passcode" type="password" autoComplete="new-password" value={second} onChange={(e) => setSecond(e.target.value)} />
      </div>
      {problem && <p role="alert" className="err">{problem}</p>}
      <button type="submit" className="btn primary wide" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
    </form>
  );
}

function ForgotForm({ onBack, onErased }: { onBack: () => void; onErased: () => void }) {
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState("");
  return (
    <div className="access-form">
      <p className="small">A passcode can&apos;t be recovered. The only way back in is to erase all Billfold data in this browser: documents, clients, products, company details and templates.</p>
      <p className="small"><strong>This can&apos;t be undone.</strong> You can restore a backup file afterwards if you have one.</p>
      <div className="field">
        <label htmlFor="erase-confirm">Type ERASE to confirm</label>
        <input id="erase-confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </div>
      {problem && <p role="alert" className="err">{problem}</p>}
      <button type="button" className="btn danger wide" disabled={typed !== "ERASE"} onClick={async () => {
        try { await eraseEverything(); removePasscode(); clearSession(); onErased(); }
        catch { setProblem("The data couldn't be erased. Close other Billfold tabs and try again."); }
      }}>Erase everything</button>
      <button type="button" className="access-link" onClick={onBack}>Back to sign in</button>
    </div>
  );
}

function AccessScreen({ onRole, notice }: { onRole: (role: Role) => void; notice: string }) {
  const [mode, setMode] = useState<"auto" | "forgot">("auto");
  const [exists, setExists] = useState(true);
  useEffect(() => { setExists(hasPasscode()); }, [mode]);
  const secure = cryptoAvailable();
  return (
    <main className="access" id="main">
      <Link href="/" className="brand access-brand" aria-label="Billfold home"><Logo /></Link>
      <h1>How do you want to continue?</h1>
      {notice && <p role="status" className="access-notice">{notice}</p>}
      <div className="access-grid">
        <section className="card">
          <header className="access-head"><ShieldCheck size={20} aria-hidden /><h2>Admin</h2></header>
          <p className="small muted">Full access: save documents, and manage clients, products and company details.</p>
          {!secure ? (
            <p role="alert" className="err">Admin access needs a secure connection. Open this site over HTTPS or on localhost.</p>
          ) : mode === "forgot" ? (
            <ForgotForm onBack={() => setMode("auto")} onErased={() => setMode("auto")} />
          ) : exists ? (
            <SignInForm onAdmin={() => onRole("admin")} onForgot={() => setMode("forgot")} />
          ) : (
            <>
              <p className="small"><strong>First time here.</strong> Create the passcode for this browser. Anything already saved here becomes admin-only.</p>
              <PasscodeFields submitLabel="Create passcode and sign in" onDone={() => onRole("admin")} />
            </>
          )}
        </section>
        <section className="card">
          <header className="access-head"><UserRound size={20} aria-hidden /><h2>Guest</h2></header>
          <p className="small muted">Try it with no passcode. Create a document, preview it and download the PDF.</p>
          <ul className="access-list small">
            <li>Can&apos;t see anything saved in this browser</li>
            <li>Can&apos;t save documents, clients or products</li>
            <li>Your work is erased when you leave guest mode or close the tab</li>
          </ul>
          <button type="button" className="btn outline wide" onClick={() => onRole("guest")}>Continue as guest <ArrowRight size={16} aria-hidden /></button>
        </section>
      </div>
      <p className="hint access-foot">This controls access on this device only. It isn&apos;t a substitute for an online account: someone with technical skills and access to this browser could still read its unencrypted data.</p>
    </main>
  );
}

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role | null | undefined>(undefined);
  const [notice, setNotice] = useState("");
  const lastActive = useRef(0);

  const enter = useCallback((next: Role) => {
    // Storage is told first, so nothing can read as the wrong role while pages mount.
    setStorageRole(next);
    writeSession(next);
    lastActive.current = Date.now();
    setNotice("");
    setRole(next);
  }, []);
  const signOut = useCallback(() => {
    clearGuestDrafts();
    clearSession();
    setStorageRole("guest");
    setRole(null);
  }, []);

  useEffect(() => {
    const saved = readSession();
    if (saved) enter(saved); else setRole(null);
  }, [enter]);

  useEffect(() => {
    if (role !== "admin") return;
    const touch = () => { lastActive.current = Date.now(); };
    const events = ["pointerdown", "keydown", "scroll"] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true, capture: true });
    const timer = setInterval(() => {
      if (Date.now() - lastActive.current >= IDLE_LIMIT_MS) { signOut(); setNotice("Signed out after 30 minutes without activity."); }
    }, 15_000);
    return () => {
      clearInterval(timer);
      for (const e of events) window.removeEventListener(e, touch, { capture: true });
    };
  }, [role, signOut]);

  const value = useMemo(() => ({ role: role ?? "guest", signOut }), [role, signOut]);
  if (role === undefined) return <div className="editor-skeleton" aria-busy="true" aria-label="Loading" />;
  if (role === null) return <AccessScreen onRole={enter} notice={notice} />;
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}
