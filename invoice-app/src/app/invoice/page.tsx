import type { Metadata } from "next";
import { Editor } from "@/components/Editor";

export const metadata: Metadata = { title: "Create an invoice" };

export default function InvoicePage() {
  return <Editor docType="invoice" />;
}
