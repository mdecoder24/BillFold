import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import { Shell } from "@/components/Shell";
import { APP_NAME } from "@/lib/brand";
import "./globals.css";

const font = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: `Free Invoice Generator, No Signup | ${APP_NAME}`, template: `%s | ${APP_NAME}` },
  description: "Create GST invoices, quotations, receipts and purchase orders in your browser. No signup, no watermark, and your data stays on your device.",
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f7f7f4" }, { media: "(prefers-color-scheme: dark)", color: "#141816" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={font.variable} suppressHydrationWarning>
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
