"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface PointNightline {
  date: string;
  dmn: number;
  baseline: number | null;
}

export function DebitNocturneChart({ donnees }: { donnees: PointNightline[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart
        data={donnees}
        margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          minTickGap={24}
        />
        <YAxis
          tickFormatter={(v: number) => `${v}`}
          tick={{ fontSize: 12 }}
          stroke="var(--muted-foreground)"
          width={40}
        />
        <Tooltip
          formatter={(value, name) => [
            `${Number(value).toFixed(2)} m³/h`,
            name,
          ]}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Line
          type="monotone"
          dataKey="dmn"
          name="Débit min. nocturne"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="baseline"
          name="Baseline (médiane 14 nuits)"
          stroke="var(--chart-3)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
