import type { NormalizedReading } from "./types.ts";

export interface ResolvedReading extends NormalizedReading {
  meterId: string;
}

function normalizeRef(ref: string): string {
  return ref.trim().toLowerCase();
}

export function resolveMeterIds(
  readings: NormalizedReading[],
  meterIdBySerial: Map<string, string>,
): { resolved: ResolvedReading[]; unresolvedMeterRefs: string[] } {
  const resolved: ResolvedReading[] = [];
  const unresolved = new Set<string>();

  for (const r of readings) {
    const meterId = meterIdBySerial.get(normalizeRef(r.meterRef));
    if (meterId) {
      resolved.push({ ...r, meterId });
    } else {
      unresolved.add(r.meterRef);
    }
  }

  return { resolved, unresolvedMeterRefs: [...unresolved] };
}

export function buildMeterIndex(
  meters: { id: string; numero_serie: string }[],
): Map<string, string> {
  return new Map(meters.map((m) => [normalizeRef(m.numero_serie), m.id]));
}
