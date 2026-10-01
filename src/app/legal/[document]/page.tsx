import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DOCUMENTS, documentLegal } from "@/lib/legal/documents";
import { TexteLegal } from "@/components/legal/TexteLegal";

export function generateStaticParams() {
  return DOCUMENTS.map((d) => ({ document: d.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ document: string }> }): Promise<Metadata> {
  const doc = documentLegal((await params).document);
  return { title: doc?.titre ?? "Informations légales" };
}

export default async function PageLegale({ params }: { params: Promise<{ document: string }> }) {
  const doc = documentLegal((await params).document);
  if (!doc) notFound();
  return <TexteLegal document={doc} />;
}
