// Seuils de détection : valeurs du plan (section 4, phase G4), surchargées
// par platform_settings.seuils puis par organizations.settings.gardien.seuils.

export interface ReglagesDetection {
  fuiteNuit: { debutH: number; finH: number; margePct: number; margeMinLph: number; nuits: number };
  apprentissage: { joursMin: number; joursMax: number };
  debitContinu: { minLph: number; heures: number };
  rupture: { facteurMax30j: number; minLph: number };
  fermeture: { minLph: number; heures: number };
  capteurMuet: { cellulaireH: number; lorawanH: number };
  reparation: { nuits: number };
  frequenceMinH: number;
}

export const REGLAGES_DEFAUT: ReglagesDetection = {
  fuiteNuit: { debutH: 2, finH: 5, margePct: 20, margeMinLph: 5, nuits: 2 },
  apprentissage: { joursMin: 7, joursMax: 14 },
  debitContinu: { minLph: 5, heures: 24 },
  rupture: { facteurMax30j: 3, minLph: 500 },
  fermeture: { minLph: 2, heures: 2 },
  capteurMuet: { cellulaireH: 36, lorawanH: 6 },
  reparation: { nuits: 2 },
  frequenceMinH: 1,
};

type Brut = Record<string, unknown> | null | undefined;

function nombre(v: unknown, defaut: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : defaut;
}

function bloc(brut: Brut, cle: string): Record<string, unknown> {
  const v = brut?.[cle];
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

/** Fusionne des réglages (clés en snake_case de platform_settings.seuils). */
export function fusionnerReglages(base: ReglagesDetection, brut: Brut): ReglagesDetection {
  const fn = bloc(brut, "fuite_nuit");
  const ap = bloc(brut, "apprentissage");
  const dc = bloc(brut, "debit_continu");
  const ru = bloc(brut, "rupture");
  const fe = bloc(brut, "fermeture");
  const cm = bloc(brut, "capteur_muet");
  const re = bloc(brut, "reparation");
  return {
    fuiteNuit: {
      debutH: nombre(fn.debut_h, base.fuiteNuit.debutH),
      finH: nombre(fn.fin_h, base.fuiteNuit.finH),
      margePct: nombre(fn.marge_pct, base.fuiteNuit.margePct),
      margeMinLph: nombre(fn.marge_min_lph, base.fuiteNuit.margeMinLph),
      nuits: Math.max(1, Math.round(nombre(fn.nuits, base.fuiteNuit.nuits))),
    },
    apprentissage: {
      joursMin: nombre(ap.jours_min, base.apprentissage.joursMin),
      joursMax: nombre(ap.jours_max, base.apprentissage.joursMax),
    },
    debitContinu: {
      minLph: nombre(dc.min_lph, base.debitContinu.minLph),
      heures: nombre(dc.heures, base.debitContinu.heures),
    },
    rupture: {
      facteurMax30j: nombre(ru.facteur_max_30j, base.rupture.facteurMax30j),
      minLph: nombre(ru.min_lph, base.rupture.minLph),
    },
    fermeture: {
      minLph: nombre(fe.min_lph, base.fermeture.minLph),
      heures: Math.max(1, Math.round(nombre(fe.heures, base.fermeture.heures))),
    },
    capteurMuet: {
      cellulaireH: nombre(cm.cellulaire_h, base.capteurMuet.cellulaireH),
      lorawanH: nombre(cm.lorawan_h, base.capteurMuet.lorawanH),
    },
    reparation: { nuits: Math.max(1, Math.round(nombre(re.nuits, base.reparation.nuits))) },
    frequenceMinH: nombre(brut?.frequence_min_h, base.frequenceMinH),
  };
}
