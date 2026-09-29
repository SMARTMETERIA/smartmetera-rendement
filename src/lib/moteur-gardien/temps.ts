// Heure locale d'un site (Europe/Paris ou Africa/Casablanca), changements
// d'heure compris : chaque instant UTC est converti par Intl, jamais par un
// décalage fixe. Module sans dépendance, recopié dans la fonction
// gardien-moteur (voir scripts/synchroniser-ingest.mjs).

export const HEURE_MS = 3_600_000;
export const JOUR_MS = 24 * HEURE_MS;

export interface PartiesLocales {
  /** « AAAA-MM-JJ » */
  date: string;
  heure: number;
  minute: number;
  /** 1 = lundi … 7 = dimanche */
  jourIso: number;
}

const formateurs = new Map<string, Intl.DateTimeFormat>();

function formateur(fuseau: string): Intl.DateTimeFormat {
  let f = formateurs.get(fuseau);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: fuseau,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    });
    formateurs.set(fuseau, f);
  }
  return f;
}

const JOURS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

// Mémoire des conversions (le moteur convertit les mêmes heures des
// milliers de fois) ; vidée au-delà de 200 000 entrées.
const memoire = new Map<string, PartiesLocales>();
const memoireInstants = new Map<string, number>();
const LIMITE_MEMOIRE = 200_000;

export function partiesLocales(instantMs: number, fuseau: string): PartiesLocales {
  const cle = `${fuseau}|${instantMs}`;
  const connue = memoire.get(cle);
  if (connue) return connue;
  const p: Record<string, string> = {};
  for (const x of formateur(fuseau).formatToParts(new Date(instantMs))) p[x.type] = x.value;
  const parties = {
    date: `${p.year}-${p.month}-${p.day}`,
    heure: Number(p.hour),
    minute: Number(p.minute),
    jourIso: JOURS[p.weekday],
  };
  if (memoire.size > LIMITE_MEMOIRE) memoire.clear();
  memoire.set(cle, parties);
  return parties;
}

export function dateLocale(instantMs: number, fuseau: string): string {
  return partiesLocales(instantMs, fuseau).date;
}

/** Jour suivant ou précédent d'une date « AAAA-MM-JJ » (calendrier seul). */
export function decalerJour(date: string, jours: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

export function jourIsoDeDate(date: string): number {
  const j = new Date(`${date}T12:00:00Z`).getUTCDay();
  return j === 0 ? 7 : j;
}

/**
 * Instant UTC correspondant à une heure locale (« AAAA-MM-JJ », heure) ;
 * si l'heure n'existe pas ce jour-là (passage à l'heure d'été), l'instant
 * de la première heure existante qui suit.
 */
export function instantLocal(date: string, heure: number, fuseau: string): number {
  const cle = `${fuseau}|${date}|${heure}`;
  const connu = memoireInstants.get(cle);
  if (connu !== undefined) return connu;
  const instant = calculerInstantLocal(date, heure, fuseau);
  if (memoireInstants.size > LIMITE_MEMOIRE) memoireInstants.clear();
  memoireInstants.set(cle, instant);
  return instant;
}

function calculerInstantLocal(date: string, heure: number, fuseau: string): number {
  const base = Date.parse(`${date}T${String(heure).padStart(2, "0")}:00:00Z`);
  for (let decalage = -14; decalage <= 14; decalage++) {
    const candidat = base - decalage * HEURE_MS;
    const p = partiesLocales(candidat, fuseau);
    if (p.date === date && p.heure === heure && p.minute === 0) return candidat;
  }
  // Heure sautée : la première heure locale existante après.
  return instantLocal(date, heure + 1, fuseau);
}

export function debutHeure(instantMs: number): number {
  return Math.floor(instantMs / HEURE_MS) * HEURE_MS;
}
