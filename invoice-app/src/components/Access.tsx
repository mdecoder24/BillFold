"use client";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  IDLE_LIMIT_MS, MIN_PASSWORD, clearFailures, clearSession, cryptoAvailable, hasCustomPassword, lockoutSeconds, readSession,
  recordFailure, removeCustomPassword, setAdminPassword, signIn, writeSession, type Role,
} from "@/lib/access";
import { clearGuestDrafts, eraseEverything, setStorageRole } from "@/lib/storage";
import { Logo } from "./Logo";

interface AccessValue { role: Role; signOut: () => void }
const AccessContext = createContext<AccessValue>({ role: "guest", signOut: () => {} });
export const useAccess = () => useContext(AccessContext);

function SignInForm({ onRole, onForgot }: { onRole: (role: Role) => void; onForgot?: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
      const role = await signIn(username, password);
      if (role) { clearFailures(); onRole(role); return; }
      recordFailure();
      const next = lockoutSeconds();
      setProblem(next ? `That username or password is wrong. Wait ${next} seconds to try again.` : "That username or password is wrong.");
      setPassword("");
    } catch {
      setProblem("Your details couldn't be checked in this browser.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="access-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="access-username">Username</label>
        <input id="access-username" autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus value={username} aria-invalid={!!problem || undefined} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="access-password">Password</label>
        <input id="access-password" type="password" autoComplete="current-password" value={password} aria-invalid={!!problem || undefined} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {problem && <p role="alert" className="err">{problem}</p>}
      <button type="submit" className="btn primary wide" disabled={busy || !username.trim() || !password}>{busy ? "Checking…" : "Sign in"}</button>
      {onForgot && <button type="button" className="access-link" onClick={onForgot}>Forgot the admin password?</button>}
    </form>
  );
}

export function PasswordFields({ submitLabel, onDone }: { submitLabel: string; onDone: () => void }) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (first.length < MIN_PASSWORD) return setProblem(`Use at least ${MIN_PASSWORD} characters.`);
    if (first !== second) return setProblem("The two passwords don't match.");
    setBusy(true);
    try { await setAdminPassword(first); onDone(); }
    catch { setProblem("The password couldn't be saved in this browser."); }
    finally { setBusy(false); }
  };
  return (
    <form className="access-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="new-password">New admin password</label>
        <input id="new-password" type="password" autoComplete="new-password" value={first} onChange={(e) => setFirst(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="confirm-password">Repeat password</label>
        <input id="confirm-password" type="password" autoComplete="new-password" value={second} onChange={(e) => setSecond(e.target.value)} />
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
      <p className="small">A changed password can&apos;t be recovered. The only way back in is to erase all Billfold data in this browser: documents, clients, products, company details and templates.</p>
      <p className="small"><strong>This can&apos;t be undone.</strong> You can restore a backup file afterwards if you have one.</p>
      <div className="field">
        <label htmlFor="erase-confirm">Type ERASE to confirm</label>
        <input id="erase-confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </div>
      {problem && <p role="alert" className="err">{problem}</p>}
      <button type="button" className="btn danger wide" disabled={typed !== "ERASE"} onClick={async () => {
        try { await eraseEverything(); removeCustomPassword(); clearSession(); onErased(); }
        catch { setProblem("The data couldn't be erased. Close other Billfold tabs and try again."); }
      }}>Erase everything</button>
      <button type="button" className="access-link" onClick={onBack}>Back to sign in</button>
    </div>
  );
}

function AccessScreen({ onRole, notice }: { onRole: (role: Role) => void; notice: string }) {
  const [forgot, setForgot] = useState(false);
  const [custom, setCustom] = useState(false);
  useEffect(() => { setCustom(hasCustomPassword()); }, [forgot]);
  return (
    <main className="access" id="main">
      <Link href="/" className="brand access-brand" aria-label="Billfold home"><Logo /></Link>
      <section className="card access-card">
        <h1>{forgot ? "Reset admin access" : "Sign in to Billfold"}</h1>
        {notice && <p role="status" className="access-notice">{notice}</p>}
        {!cryptoAvailable() ? (
          <p role="alert" className="err">Sign-in needs a secure connection. Open this site over HTTPS or on localhost.</p>
        ) : forgot ? (
          <ForgotForm onBack={() => setForgot(false)} onErased={() => setForgot(false)} />
        ) : (
          <SignInForm onRole={onRole} onForgot={custom ? () => setForgot(true) : undefined} />
        )}
        {!forgot && (
          <dl className="access-roles small">
            <div><dt>Admin</dt><dd>Full access to saved documents, clients, products and company details.</dd></div>
            <div><dt>Guest</dt><dd>Create and download documents. Nothing is saved, and saved data stays hidden.</dd></div>
          </dl>
        )}
      </section>
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
