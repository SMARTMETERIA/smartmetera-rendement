"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { VueGraphique } from "@/lib/gardien-rapports/affichage";

const nombre = (v: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(v);

/** Courbe de la nuit ou barres par jour d'un rapport (couleurs du thème). */
export function GraphiqueRapport({ graphique }: { graphique: VueGraphique }) {
  const donnees = graphique.points.map((p) => ({ etiquette: p.etiquette, valeur: p.valeur }));
  const infobulle = (
    <Tooltip
      formatter={(value) => [`${nombre(Number(value))} ${graphique.unite}`, graphique.titre]}
      contentStyle={{ fontSize: 12, borderRadius: 8 }}
    />
  );
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis dataKey="etiquette" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" minTickGap={8} />
      <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={44} tickFormatter={nombre} />
    </>
  );
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium">
        {graphique.titre} ({graphique.unite})
      </figcaption>
      <ResponsiveContainer width="100%" height={220}>
        {graphique.forme === "courbe" ? (
          <LineChart data={donnees} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            {axes}
            {infobulle}
            <Line type="monotone" dataKey="valeur" stroke="var(--chart-1)" strokeWidth={2} connectNulls={false} />
          </LineChart>
        ) : (
          <BarChart data={donnees} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            {axes}
            {infobulle}
            <Bar dataKey="valeur" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </figure>
  );
}
