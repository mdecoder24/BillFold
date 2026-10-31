import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Editor } from "@/components/Editor";
import { TOOLS } from "@/lib/routes";

type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => TOOLS.map(({ slug }) => ({ slug }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = TOOLS.find((t) => t.slug === slug);
  return found ? { title: found.title, description: found.blurb } : {};
}

export default async function ToolPage({ params }: Props) {
  const { slug } = await params;
  const tool = TOOLS.find((t) => t.slug === slug);
  if (!tool) notFound();
  return <Editor docType={tool.docType} template={tool.template} />;
}
