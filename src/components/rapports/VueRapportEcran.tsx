import type { ReactNode } from "react";
import type { VueRapport } from "@/lib/gardien-rapports/affichage";
import { GraphiqueRapport } from "@/components/rapports/GraphiqueRapport";

/**
 * Affichage d'un rapport ou d'une page preuve : se comprend en dix
 * secondes (un grand chiffre, une phrase, une courbe), le détail ensuite.
 */
export function VueRapportEcran({ vue, actions }: { vue: VueRapport; actions?: ReactNode }) {
  return (
    <article className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{vue.titre}</h1>
        <p className="text-muted-foreground text-sm">{vue.sousTitre}</p>
      </header>
      {vue.chiffre && (
        <div>
          <p className="text-primary font-heading text-5xl font-semibold tabular-nums sm:text-6xl">{vue.chiffre.valeur}</p>
          <p className="text-muted-foreground text-sm">{vue.chiffre.libelle}</p>
        </div>
      )}
      <p className="text-lg">{vue.phrase}</p>
      {actions}
      {vue.graphique && <GraphiqueRapport graphique={vue.graphique} />}
      {vue.blocs.map((bloc) => (
        <section key={bloc.titre} className="space-y-2">
          <h2 className="text-lg font-semibold">{bloc.titre}</h2>
          {bloc.lignes && (
            <dl className="divide-y rounded-lg border">
              {bloc.lignes.map(([libelle, valeur], i) => (
                <div key={i} className="grid gap-1 p-3 sm:grid-cols-[14rem_1fr]">
                  <dt className="text-muted-foreground text-sm">{libelle}</dt>
                  <dd className="text-sm tabular-nums">{valeur}</dd>
                </div>
              ))}
            </dl>
          )}
          {bloc.paragraphes?.map((p, i) => (
            <p key={i} className="text-sm">
              {p}
            </p>
          ))}
        </section>
      ))}
      <footer className="text-muted-foreground space-y-1 border-t pt-4 text-xs">
        {vue.notes.map((n) => (
          <p key={n}>{n}</p>
        ))}
      </footer>
    </article>
  );
}
