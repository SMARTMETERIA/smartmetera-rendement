// Débit minimum de nuit d'un point, fenêtre en heure locale du site (par
// défaut de 2 h à 5 h), hors plages calmes déclarées.
import type { DebitHoraire } from "./debits";
import { heureEnPlageCalme, type PlageCalme } from "./plages";
import { partiesLocales } from "./temps";

export interface NuitCalculee {
  /** Date locale du matin de la nuit. */
  date: string;
  /** Débit minimum de la fenêtre, L/h ; null si données insuffisantes. */
  dmnLph: number | null;
  /** Heures utilisables dans la fenêtre. */
  heures: number;
  /** Heures écartées parce qu'elles tombent dans une plage calme. */
  heuresCalmes: number;
}

/** Au moins deux heures mesurées sont nécessaires pour conclure. */
export const HEURES_NUIT_MIN = 2;

export function debitMinNocturne(
  debits: DebitHoraire[],
  date: string,
  fuseau: string,
  fenetre: { debutH: number; finH: number },
  plages: PlageCalme[],
  meterId: string,
): NuitCalculee {
  let min: number | null = null;
  let heures = 0;
  let heuresCalmes = 0;
  for (const d of debits) {
    const l = partiesLocales(d.heureMs, fuseau);
    if (l.date !== date || l.heure < fenetre.debutH || l.heure >= fenetre.finH) continue;
    if (heureEnPlageCalme(d.heureMs, fuseau, plages, meterId)) {
      heuresCalmes++;
      continue;
    }
    if (d.lph === null) continue;
    heures++;
    min = min === null ? d.lph : Math.min(min, d.lph);
  }
  return { date, dmnLph: heures >= HEURES_NUIT_MIN ? min : null, heures, heuresCalmes };
}
