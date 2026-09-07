// Applique un point décodé (index cumulatif ou delta) à l'état mémorisé
// d'un équipement (devices.dernier_index_impulsions/dernier_horodatage) et
// produit le volume en m³ à insérer dans readings. Même heuristique de
// rollover que src/lib/import/computeDeltas.ts (delta négatif corrigé par
// tour de compteur seulement s'il reste plausible, sinon quality_flag
// 'suspecte' plutôt qu'un rejet — voir CLAUDE.md : jamais de suppression).
import type { PointReleve } from "./types.ts";

export interface EtatDevice {
  dernierIndexImpulsions: number | null;
  dernierHorodatage: string | null;
}

export type QualityFlag = "valide" | "corrigee" | "suspecte";

export interface ResultatDelta {
  volumeM3: number;
  qualityFlag: QualityFlag;
  note?: string;
  /** true si aucun relevé ne doit être inséré (ex : premier point d'un équipement, on ne fait qu'initialiser l'état). */
  ignorer?: boolean;
  nouvelEtat: EtatDevice;
}

export function appliquerPointReleve(
  etat: EtatDevice,
  point: Pick<PointReleve, "impulsions" | "nature" | "horodatage">,
  litresParImpulsion: number,
  maxImpulsions: number,
): ResultatDelta {
  if (point.nature === "delta") {
    return {
      volumeM3: (point.impulsions * litresParImpulsion) / 1000,
      qualityFlag: "valide",
      nouvelEtat: {
        dernierIndexImpulsions: etat.dernierIndexImpulsions,
        dernierHorodatage: point.horodatage,
      },
    };
  }

  if (etat.dernierIndexImpulsions === null) {
    return {
      volumeM3: 0,
      qualityFlag: "valide",
      ignorer: true,
      note: "Premier relevé de l'équipement : index initialisé, aucun delta calculable",
      nouvelEtat: {
        dernierIndexImpulsions: point.impulsions,
        dernierHorodatage: point.horodatage,
      },
    };
  }

  const nouvelEtat: EtatDevice = {
    dernierIndexImpulsions: point.impulsions,
    dernierHorodatage: point.horodatage,
  };
  const brut = point.impulsions - etat.dernierIndexImpulsions;

  if (brut >= 0) {
    return {
      volumeM3: (brut * litresParImpulsion) / 1000,
      qualityFlag: "valide",
      nouvelEtat,
    };
  }

  const rolloverDelta = maxImpulsions - etat.dernierIndexImpulsions + point.impulsions;
  if (rolloverDelta >= 0 && rolloverDelta < maxImpulsions * 0.5) {
    return {
      volumeM3: (rolloverDelta * litresParImpulsion) / 1000,
      qualityFlag: "corrigee",
      note: "Rollover détecté et corrigé",
      nouvelEtat,
    };
  }

  return {
    volumeM3: 0,
    qualityFlag: "suspecte",
    note: "Delta négatif inexpliqué (remplacement d'équipement probable) — à vérifier",
    nouvelEtat,
  };
}
