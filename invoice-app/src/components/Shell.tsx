"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Building2, Calculator, FileText, LogOut, Menu, Package, Plus, ShieldCheck, UserRound, Users, X } from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import { AccessProvider, useAccess } from "./Access";
import { Logo } from "./Logo";

const NAV = [
  { href: "/documents", label: "Documents", icon: FileText, admin: true },
  { href: "/clients", label: "Clients", icon: Users, admin: true },
  { href: "/products", label: "Products", icon: Package, admin: true },
  { href: "/company", label: "Company", icon: Building2, admin: true },
  { href: "/calculators", label: "Calculators", icon: Calculator, admin: false },
];
const ADMIN_PATHS = NAV.filter((n) => n.admin).map((n) => n.href);

function AdminOnly() {
  const { signOut } = useAccess();
  return (
    <div className="page">
      <div className="empty">
        <h1>Admin access required</h1>
        <p>Guests can&apos;t open this page. Sign in as admin to see saved data.</p>
        <div className="row">
          <button type="button" className="btn primary" onClick={signOut}>Sign in as admin</button>
          <a href="/invoice" className="btn outline">Create a document</a>
        </div>
      </div>
    </div>
  );
}

function Portal({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { role, signOut } = useAccess();
  const [open, setOpen] = useState(false);
  const guest = role === "guest";
  const blocked = guest && ADMIN_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <header className="side">
        <div className="side-top">
          <Link href="/" className="brand" aria-label={`${APP_NAME} home`}><Logo /></Link>
          <button type="button" className="icon-btn menu-toggle" aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((v) => !v)}>
            {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </div>
        <nav aria-label="Main" className="side-nav" data-open={open}>
          {/* A full page load, so "new" always starts clean even when an invoice is already open. */}
          <a href="/invoice" className="btn primary side-new" aria-label="New invoice"><Plus size={18} aria-hidden /><span className="nav-label">New invoice</span></a>
          {NAV.filter((n) => !guest || !n.admin).map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="nav-link" aria-current={path === href ? "page" : undefined} title={label} onClick={() => setOpen(false)}>
              <Icon size={18} aria-hidden /><span className="nav-label">{label}</span>
            </Link>
          ))}
          <div className="side-account">
            <p className="side-note nav-label">{guest ? "Guest work isn't saved. Download your PDF before leaving." : "Everything stays in this browser. Nothing is uploaded."}</p>
            <span className="role-badge" title={guest ? "Signed in as guest" : "Signed in as admin"}>
              {guest ? <UserRound size={16} aria-hidden /> : <ShieldCheck size={16} aria-hidden />}
              <span className="nav-label">{guest ? "Guest" : "Admin"}</span>
            </span>
            <button type="button" className="nav-link side-out" title={guest ? "Leave guest mode" : "Sign out"} aria-label={guest ? "Leave guest mode" : "Sign out"} onClick={signOut}>
              <LogOut size={18} aria-hidden /><span className="nav-label">{guest ? "Leave guest mode" : "Sign out"}</span>
            </button>
          </div>
        </nav>
      </header>
      <main id="main" className="content">{blocked ? <AdminOnly /> : children}</main>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  // The landing page is public and has its own header. Everything else sits behind the access screen.
  if (path === "/") return <>{children}</>;
  return <AccessProvider><Portal>{children}</Portal></AccessProvider>;
}
