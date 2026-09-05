import { normalizeHeader } from "./headers";

const KEYWORDS: Record<string, string[]> = {
  meter_ref: [
    "compteur",
    "meter",
    "device",
    "serial",
    "numero",
    "id",
    "ouvrage",
    "reference",
  ],
  ts: ["date", "timestamp", "horodatage", "time", "releve"],
  value: [
    "volume",
    "index",
    "value",
    "valeur",
    "reading",
    "consumption",
    "cumulative",
  ],
  commune: ["commune"],
  annee: ["annee", "exercice", "year"],
  volume_comptabilise: ["volume", "consommation", "facture"],
  nb_abonnes: ["abonnes", "abonne", "subscribers"],
};

/** Cherche d'abord une correspondance exacte avec le nom attendu (modèle), puis un mot-clé. */
export function detectColumn(
  headers: string[],
  field: string,
  hint?: string,
): string | null {
  if (hint) {
    const exact = headers.find(
      (h) => normalizeHeader(h) === normalizeHeader(hint),
    );
    if (exact) return exact;
  }
  const keywords = KEYWORDS[field] ?? [];
  const byKeyword = headers.find((h) => {
    const normalized = normalizeHeader(h);
    return keywords.some((k) => normalized.includes(k));
  });
  return byKeyword ?? null;
}

export function autoDetectMapping<T extends Record<string, string | undefined>>(
  headers: string[],
  hint: T,
): { [K in keyof T]: string | null } {
  const result = {} as { [K in keyof T]: string | null };
  for (const field of Object.keys(hint) as (keyof T)[]) {
    result[field] = detectColumn(headers, String(field), hint[field]);
  }
  return result;
}
