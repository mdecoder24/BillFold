import type { Metadata } from "next";
import { Landing } from "@/components/Landing";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: { absolute: `${APP_NAME}: Free GST Invoice Generator, No Signup` },
  description: "Create GST invoices, quotations, receipts, credit notes and purchase orders in your browser. No signup, no watermark, and your data stays on your device.",
};

export default function Home() {
  return <Landing />;
}
