import type { NormalizedReading, RowError } from "./types";

interface IndexPoint {
  rowNumber: number;
  ts: Date;
  indexM3: number;
}

/**
 * Transforme une série d'index cumulés (triée par compteur) en volumes par
 * intervalle. Gère le rollover (compteur mécanique qui repasse à zéro) et
 * signale les deltas négatifs inexpliqués (remplacement de compteur probable)
 * via quality_flag plutôt que de les rejeter — voir CLAUDE.md : jamais de
 * suppression, toujours un flag qualité.
 */
export function computeDeltasForMeter(
  points: IndexPoint[],
  /** Déjà converti dans la même unité (m³) que indexM3 — voir transformReadings. */
  maxValueM3: number | undefined,
): { readings: Omit<NormalizedReading, "meterRef">[]; ignored: RowError[] } {
  const sorted = [...points].sort((a, b) => a.ts.getTime() - b.ts.getTime());
  const readings: Omit<NormalizedReading, "meterRef">[] = [];
  const ignored: RowError[] = [];

  if (sorted.length === 0) {
    return { readings, ignored };
  }

  ignored.push({
    rowNumber: sorted[0].rowNumber,
    raw: [],
    reason:
      "Premier relevé du compteur : aucun delta calculable, ligne ignorée",
  });

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const delta = curr.indexM3 - prev.indexM3;

    if (delta >= 0) {
      readings.push({
        rowNumber: curr.rowNumber,
        ts: curr.ts,
        volumeM3: delta,
        qualityFlag: "valide",
      });
      continue;
    }

    if (maxValueM3 !== undefined) {
      const rolloverDelta = maxValueM3 - prev.indexM3 + curr.indexM3;
      // Le delta corrigé doit rester une consommation plausible (< moitié de
      // la plage du compteur), sinon ce n'est probablement pas un rollover.
      if (rolloverDelta >= 0 && rolloverDelta < maxValueM3 * 0.5) {
        readings.push({
          rowNumber: curr.rowNumber,
          ts: curr.ts,
          volumeM3: rolloverDelta,
          qualityFlag: "corrigee",
          note: "Rollover détecté et corrigé",
        });
        continue;
      }
    }

    readings.push({
      rowNumber: curr.rowNumber,
      ts: curr.ts,
      volumeM3: 0,
      qualityFlag: "suspecte",
      note: "Delta négatif inexpliqué (remplacement de compteur probable) — à vérifier",
    });
  }

  return { readings, ignored };
}
