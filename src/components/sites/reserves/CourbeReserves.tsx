"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Volume utile des réserves sur 48 heures, suivi de la prévision au rythme
 * de consommation réel (en pointillés) et du niveau bas réglé.
 */
export function CourbeReserves({
  mesures,
  prevision,
  niveauBasM3,
  fuseau,
}: {
  mesures: { t: number; volume: number | null }[];
  prevision: { t: number; prevision: number }[];
  niveauBasM3: number;
  fuseau: string;
}) {
  const heure = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: fuseau,
  });
  const donnees = [
    ...mesures.map((m) => ({ t: m.t, volume: m.volume, prevision: null as number | null })),
    ...prevision.map((p) => ({ t: p.t, volume: null as number | null, prevision: p.prevision })),
  ].sort((a, b) => a.t - b.t);
  if (!mesures.some((m) => m.volume !== null)) {
    return <p className="text-muted-foreground text-sm">Pas encore de mesure de niveau sur les 48 dernières heures.</p>;
  }
  return (
    <figure className="space-y-2">
      <figcaption className="text-muted-foreground text-sm">
        Eau utilisable dans les réserves (m³), heure du site. Pointillés : prévision sans arrivée d&apos;eau, au
        rythme de consommation réel.
      </figcaption>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={donnees} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t: number) => heure.format(t)}
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
            minTickGap={32}
          />
          <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={44} domain={[0, "auto"]} />
          <ReferenceLine
            y={niveauBasM3}
            stroke="var(--destructive)"
            strokeDasharray="4 4"
            label={{ value: "Niveau bas", position: "insideTopRight", fill: "var(--destructive)", fontSize: 11 }}
          />
          <Tooltip
            labelFormatter={(t) => heure.format(Number(t))}
            formatter={(v, nom) => [
              `${Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} m³`,
              nom === "prevision" ? "Prévision" : "Mesuré",
            ]}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Line type="monotone" dataKey="volume" stroke="var(--chart-1)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="prevision"
            stroke="var(--chart-2)"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}
