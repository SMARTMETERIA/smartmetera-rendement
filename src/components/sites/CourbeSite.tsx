"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Consommation heure par heure sur 30 jours, avec la bande de nuit
 * (fenêtre de détection, heure du site) en arrière-plan.
 */
export function CourbeSite({
  points,
  nuits,
  fuseau,
}: {
  points: { t: number; lph: number }[];
  nuits: { debut: number; fin: number }[];
  fuseau: string;
}) {
  const jour = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: fuseau });
  const heure = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: fuseau,
  });
  if (points.length === 0) {
    return <p className="text-muted-foreground text-sm">Pas encore de relevés sur les 30 derniers jours.</p>;
  }
  const debut = points[0].t;
  const fin = points[points.length - 1].t;
  return (
    <figure className="space-y-2">
      <figcaption className="text-muted-foreground text-sm">
        Litres par heure. Bandes grises : la nuit, quand le moteur cherche les fuites.
      </figcaption>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          {nuits
            .filter((n) => n.fin >= debut && n.debut <= fin)
            .map((n) => (
              <ReferenceArea key={n.debut} x1={n.debut} x2={n.fin} fill="var(--muted)" fillOpacity={0.8} ifOverflow="hidden" />
            ))}
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[debut, fin]}
            tickFormatter={(t: number) => jour.format(t)}
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
            minTickGap={24}
          />
          <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={44} />
          <Tooltip
            labelFormatter={(t) => heure.format(Number(t))}
            formatter={(v) => [`${Number(v).toLocaleString("fr-FR")} L/h`, "Débit"]}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Line type="monotone" dataKey="lph" stroke="var(--chart-1)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}
