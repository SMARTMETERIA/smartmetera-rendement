import type { Metadata } from "next";
import Link from "next/link";
import { DOCUMENTS, VERSION_DOCUMENTS } from "@/lib/legal/documents";
import { BandeauModele } from "@/components/legal/TexteLegal";

export const metadata: Metadata = { title: "Informations légales" };

export default function PageInformationsLegales() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Informations légales</h1>
        <p className="text-muted-foreground text-sm">{VERSION_DOCUMENTS}</p>
      </header>
      <BandeauModele />
      <ul className="divide-y rounded-lg border">
        {DOCUMENTS.map((d) => (
          <li key={d.slug}>
            <Link href={`/legal/${d.slug}`} className="hover:bg-muted/50 block p-4">
              <span className="font-medium">{d.titre}</span>
              <span className="text-muted-foreground block text-sm">{d.resume}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p>
        <Link href="/" className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline">
          ← Accueil
        </Link>
      </p>
    </main>
  );
}
