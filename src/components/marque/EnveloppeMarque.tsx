import type { CSSProperties, ReactNode } from "react";
import { variablesTheme, type Marque } from "@/lib/marque";

/**
 * Applique le thème d'une marque (variables CSS) à tout ce qu'elle
 * contient : boutons, focus, courbes. Les couleurs viennent de la marque,
 * jamais du code.
 */
export function EnveloppeMarque({
  marque,
  children,
  className,
}: {
  marque: Marque;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div style={variablesTheme(marque) as CSSProperties} className={className}>
      {children}
    </div>
  );
}

/** Logo (s'il existe) ou nom de la marque. */
export function EnteteMarque({ marque, taille = "normale" }: { marque: Marque; taille?: "normale" | "grande" }) {
  return marque.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- logo hébergé par le partenaire, dimensions libres
    <img src={marque.logoUrl} alt={marque.nom} className={taille === "grande" ? "h-12 w-auto" : "h-8 w-auto"} />
  ) : (
    <span className={taille === "grande" ? "text-2xl font-semibold" : "text-lg font-semibold tracking-tight"}>
      {marque.nom}
    </span>
  );
}
