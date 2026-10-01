import Link from "next/link";
import { morceaux, STATUT_DOCUMENTS, VERSION_DOCUMENTS, type DocumentLegal } from "@/lib/legal/documents";
import { PiedLegal } from "./PiedLegal";

/** Bandeau tant que les textes n'ont pas été validés par un juriste. */
export function BandeauModele() {
  if (STATUT_DOCUMENTS !== "modele") return null;
  return (
    <p role="note" className="border-attention bg-attention/10 rounded-md border px-4 py-3 text-sm">
      <strong>Modèle à faire valider.</strong> Ce texte n&apos;a pas encore été relu par un juriste et
      n&apos;a pas de valeur contractuelle en l&apos;état. Les passages surlignés restent à compléter.
    </p>
  );
}

function Paragraphe({ texte }: { texte: string }) {
  return (
    <p>
      {morceaux(texte).map((m, i) =>
        m.aCompleter ? (
          <mark key={i} className="bg-attention/25 text-foreground rounded px-1">
            {m.texte}
          </mark>
        ) : (
          <span key={i}>{m.texte}</span>
        ),
      )}
    </p>
  );
}

export function TexteLegal({ document }: { document: DocumentLegal }) {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <nav className="text-sm">
        <Link href="/legal" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
          ← Informations légales
        </Link>
      </nav>
      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{document.titre}</h1>
        <p className="text-muted-foreground text-sm">{VERSION_DOCUMENTS}</p>
      </header>
      <BandeauModele />
      {document.sections().map((s) => (
        <section key={s.titre} className="space-y-2">
          <h2 className="text-lg font-semibold">{s.titre}</h2>
          <div className="space-y-2 leading-relaxed">
            {s.paragraphes.map((p, i) => (
              <Paragraphe key={i} texte={p} />
            ))}
          </div>
        </section>
      ))}
      <PiedLegal className="border-t pt-6" />
    </main>
  );
}
