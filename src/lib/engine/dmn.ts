/** Miroir TypeScript testable de calculer_nightline()/detecter_alerte_fuite_secteur() (SQL). */

export interface DebitHoraire {
  ts: Date;
  debitM3h: number;
}

function heureLocale(date: Date, timeZone = "Europe/Paris"): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  });
  return Number(dtf.format(date));
}

/**
 * DMN = minimum du débit horaire sur la fenêtre [2h, 4h) heure locale.
 * Un débit horodaté ts couvre l'heure se terminant à ts (convention
 * readings) : l'heure locale 3 couvre [2h,3h), l'heure locale 4 couvre
 * [3h,4h) — ensemble, exactement [2h,4h).
 */
export function calculerDebitMinNocturne(
  debits: DebitHoraire[],
  timeZone = "Europe/Paris",
): number | null {
  const fenetre = debits.filter((d) => {
    const h = heureLocale(d.ts, timeZone);
    return h === 3 || h === 4;
  });
  if (fenetre.length === 0) return null;
  return Math.min(...fenetre.map((d) => d.debitM3h));
}

/** Baseline = médiane des DMN des nuits précédentes (14 nuits typiquement). */
export function calculerBaseline(dmnHistorique: number[]): number | null {
  if (dmnHistorique.length === 0) return null;
  const tries = [...dmnHistorique].sort((a, b) => a - b);
  const milieu = Math.floor(tries.length / 2);
  return tries.length % 2 === 0
    ? (tries[milieu - 1] + tries[milieu]) / 2
    : tries[milieu];
}

/** Fuite estimée (m³/j) = (DMN - conso légitime nocturne) × 20, jamais négative. */
export function estimerFuiteM3j(dmn: number, nbAbonnesSecteur: number): number {
  const consommationLegitimeM3h = (nbAbonnesSecteur * 1.7) / 1000;
  return Math.max((dmn - consommationLegitimeM3h) * 20, 0);
}

/** Seuil de déclenchement d'une nuit donnée : baseline + max(20 %, 0,5 m³/h). */
export function depasseSeuilAlerte(dmn: number, baseline: number): boolean {
  return dmn > baseline + Math.max(baseline * 0.2, 0.5);
}

/** Alerte fuite : les 3 dernières nuits (dans l'ordre chronologique) dépassent chacune leur seuil. */
export function detecterAlerteFuite(
  dernieresNuits: { dmn: number; baseline: number | null }[],
): boolean {
  if (dernieresNuits.length < 3) return false;
  const troisDernieres = dernieresNuits.slice(-3);
  return troisDernieres.every(
    (n) => n.baseline !== null && depasseSeuilAlerte(n.dmn, n.baseline),
  );
}
