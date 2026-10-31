"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Building2, Calculator, FileText, Menu, Package, Plus, Users, X } from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import { Logo } from "./Logo";

const NAV = [
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/products", label: "Products", icon: Package },
  { href: "/company", label: "Company", icon: Building2 },
  { href: "/calculators", label: "Calculators", icon: Calculator },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // The landing page has its own header, so the app sidebar starts at the portal.
  if (path === "/") return <>{children}</>;
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
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="nav-link" aria-current={path === href ? "page" : undefined} title={label} onClick={() => setOpen(false)}>
              <Icon size={18} aria-hidden /><span className="nav-label">{label}</span>
            </Link>
          ))}
          <p className="side-note nav-label">Everything stays in this browser. Nothing is uploaded.</p>
        </nav>
      </header>
      <main id="main" className="content">{children}</main>
    </div>
  );
}
