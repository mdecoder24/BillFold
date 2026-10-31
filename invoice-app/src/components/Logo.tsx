import { APP_NAME } from "@/lib/brand";

/** The B is an invoice: a page with a folded corner, its counters drawn as two ruled lines. */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden focusable="false">
      <rect width="64" height="64" rx="15" fill="#0f5f4c" />
      <path fill="#fff" d="M16 11H37L46 20V25C46 28 44 30.5 41.5 31.5C45 32.5 48 35.2 48 39.5V42C48 48 44 53 37 53H16Z" />
      <path fill="#a9d8c8" d="M37 11V20H46Z" />
      <rect x="24" y="21" width="13" height="4.5" rx="1.5" fill="#0f5f4c" />
      <rect x="24" y="38" width="16" height="4.5" rx="1.5" fill="#0f5f4c" />
    </svg>
  );
}

export function Logo({ size = 26 }: { size?: number }) {
  return <span className="logo"><LogoMark size={size} /><span className="brand-name">{APP_NAME}</span></span>;
}
