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

export interface PointTendance {
  mois: string;
  rendementPct: number;
  seuilPct: number;
}

export function TendanceRendementChart({
  donnees,
}: {
  donnees: PointTendance[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart
        data={donnees}
        margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="mois"
          tick={{ fontSize: 12 }}
          stroke="var(--muted-foreground)"
        />
        <YAxis
          domain={["dataMin - 2", "dataMax + 2"]}
          tickFormatter={(v: number) => `${v}%`}
          tick={{ fontSize: 12 }}
          stroke="var(--muted-foreground)"
          width={48}
        />
        <Tooltip
          formatter={(value, name) => [`${Number(value).toFixed(2)} %`, name]}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <ReferenceLine
          y={85}
          stroke="var(--chart-2)"
          strokeDasharray="4 4"
          label={{ value: "85 %", fontSize: 11, position: "insideTopLeft" }}
        />
        <Line
          type="monotone"
          dataKey="seuilPct"
          name="Seuil réglementaire"
          stroke="var(--chart-4)"
          strokeWidth={1.5}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="rendementPct"
          name="Rendement"
          stroke="var(--chart-1)"
          strokeWidth={2.5}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
