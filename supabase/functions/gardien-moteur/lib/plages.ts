// Plages où une consommation est normale la nuit (arrosage, remplissage de
// piscine) et périodes de fermeture du site, en heure et dates locales.
import { HEURE_MS, decalerJour, jourIsoDeDate, partiesLocales } from "./temps.ts";

export interface PlageCalme {
  /** null : tous les points du site. */
  meterId: string | null;
  /** Jours ISO (1 = lundi) ; null : tous les jours. */
  joursIso: number[] | null;
  /** « HH:MM » ou « HH:MM:SS », heure locale. */
  debut: string;
  fin: string;
  /** Dates locales incluses, facultatives. */
  depuis: string | null;
  jusqua: string | null;
}

export interface PeriodeFermeture {
  debut: string;
  fin: string;
  libelle?: string;
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

function plageActiveLe(p: PlageCalme, date: string): boolean {
  if (p.depuis && date < p.depuis) return false;
  if (p.jusqua && date > p.jusqua) return false;
  return !p.joursIso || p.joursIso.includes(jourIsoDeDate(date));
}

/** Intervalles [début, fin) en minutes du jour local où la plage s'applique. */
function intervallesDuJour(p: PlageCalme, date: string): [number, number][] {
  const d = minutes(p.debut);
  const f = minutes(p.fin);
  const liste: [number, number][] = [];
  if (d < f) {
    if (plageActiveLe(p, date)) liste.push([d, f]);
  } else {
    // Passe minuit : de d à minuit le jour J, de minuit à f le lendemain.
    if (plageActiveLe(p, date)) liste.push([d, 24 * 60]);
    if (plageActiveLe(p, decalerJour(date, -1))) liste.push([0, f]);
  }
  return liste;
}

/** L'heure UTC commençant à heureMs chevauche-t-elle une plage calme ? */
export function heureEnPlageCalme(
  heureMs: number,
  fuseau: string,
  plages: PlageCalme[],
  meterId: string,
): boolean {
  const concernees = plages.filter((p) => p.meterId === null || p.meterId === meterId);
  if (concernees.length === 0) return false;
  // Heure découpée en deux demi-heures : suffit pour des plages à la minute
  // près tant qu'elles durent au moins 30 minutes.
  for (const decalage of [0, HEURE_MS / 2 - 60_000, HEURE_MS - 60_000]) {
    const l = partiesLocales(heureMs + decalage, fuseau);
    const m = l.heure * 60 + l.minute;
    for (const p of concernees) {
      if (intervallesDuJour(p, l.date).some(([a, b]) => m >= a && m < b)) return true;
    }
  }
  return false;
}

/** Période de fermeture contenant la date locale, sinon null. */
export function periodeFermee(
  periodes: PeriodeFermeture[],
  date: string,
): PeriodeFermeture | null {
  return periodes.find((p) => p.debut <= date && date <= p.fin) ?? null;
}

/** Lit la colonne sites.closed_periods (jsonb) sans faire confiance au contenu. */
export function lirePeriodesFermeture(brut: unknown): PeriodeFermeture[] {
  if (!Array.isArray(brut)) return [];
  return brut
    .map((p) => p as Record<string, unknown>)
    .filter(
      (p) =>
        typeof p?.start === "string" &&
        typeof p?.end === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(p.start) &&
        /^\d{4}-\d{2}-\d{2}$/.test(p.end),
    )
    .map((p) => ({
      debut: p.start as string,
      fin: p.end as string,
      libelle: typeof p.label === "string" ? p.label : undefined,
    }));
}
