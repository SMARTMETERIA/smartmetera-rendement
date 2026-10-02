// Écran « Réserves d'eau » (phase G11) : saisie d'une réserve et mise en
// forme de l'autonomie d'un site (pur, testable).
import {
  HORIZON_H,
  dureeLisible,
  instantLisible,
  phraseReserves,
  type EtatAutonomie,
} from "@/lib/moteur-gardien/autonomie";
import type { TonEtat } from "./etatSurveillance";

export const TYPES_RESERVE = ["citerne", "bache", "chateau_eau", "autre"] as const;
export type TypeReserve = (typeof TYPES_RESERVE)[number];

export const LIBELLES_TYPE_RESERVE: Record<TypeReserve, string> = {
  citerne: "Citerne",
  bache: "Bâche (réservoir enterré)",
  chateau_eau: "Château d'eau",
  autre: "Autre réserve",
};

export const LIBELLES_FORME: Record<"verticale" | "cylindre_horizontal", string> = {
  verticale: "Cuve debout ou réservoir à parois droites",
  cylindre_horizontal: "Cuve couchée (cylindre)",
};

export const LIBELLES_MONTAGE: Record<"distance" | "hauteur", string> = {
  distance: "Au-dessus de l'eau (mesure la distance jusqu'à la surface)",
  hauteur: "Au fond de la réserve (mesure la hauteur d'eau)",
};

export interface SaisieReserve {
  label: string;
  kind: string;
  capacite: string;
  forme: string;
  hauteurPleine: string;
  hauteurPrise: string;
  montage: string;
  hauteurCapteur: string;
  seuilBas: string;
  deviceId: string;
}

/** Champs envoyés à reserve_enregistrer. */
export interface ChampsReserve {
  label: string;
  kind: TypeReserve;
  capacity_m3: number;
  shape: "verticale" | "cylindre_horizontal";
  full_height_m: number;
  outlet_height_m: number;
  sensor_mounting: "distance" | "hauteur";
  sensor_height_m: number | null;
  low_threshold_pct: number | null;
  device_id: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** « 2,5 » ou « 2.5 » → 2,5 ; vide → null ; illisible → NaN. */
function decimal(saisie: string): number | null {
  const t = saisie.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN;
}

export function validerReserve(s: SaisieReserve): { ok: true; champs: ChampsReserve } | { ok: false; erreur: string } {
  const label = s.label.trim();
  if (label.length < 1 || label.length > 120) return { ok: false, erreur: "Donnez un nom à la réserve (par exemple « Citerne du toit »)." };
  if (!(TYPES_RESERVE as readonly string[]).includes(s.kind)) return { ok: false, erreur: "Choisissez le type de réserve." };
  const capacite = decimal(s.capacite);
  if (capacite === null || !(capacite > 0) || capacite > 100000) {
    return { ok: false, erreur: "Indiquez le volume de la réserve pleine, en m³ (par exemple 10)." };
  }
  if (s.forme !== "verticale" && s.forme !== "cylindre_horizontal") return { ok: false, erreur: "Choisissez la forme de la réserve." };
  const pleine = decimal(s.hauteurPleine);
  if (pleine === null || !(pleine > 0) || pleine > 50) {
    return {
      ok: false,
      erreur:
        s.forme === "cylindre_horizontal"
          ? "Indiquez le diamètre intérieur de la cuve, en mètres (par exemple 2,1)."
          : "Indiquez la hauteur d'eau quand la réserve est pleine, en mètres (par exemple 2,5).",
    };
  }
  const prise = decimal(s.hauteurPrise) ?? 0;
  if (!(prise >= 0) || prise >= pleine) {
    return { ok: false, erreur: "La prise d'eau doit être plus basse que le niveau plein (0 si elle est au fond)." };
  }
  if (s.montage !== "distance" && s.montage !== "hauteur") return { ok: false, erreur: "Indiquez où le capteur est posé." };
  const capteur = decimal(s.hauteurCapteur);
  if (s.montage === "distance" && (capteur === null || Number.isNaN(capteur) || capteur < pleine || capteur > 60)) {
    return {
      ok: false,
      erreur: "Indiquez la hauteur du capteur au-dessus du fond, en mètres : elle est au moins égale au niveau plein.",
    };
  }
  const seuil = decimal(s.seuilBas);
  if (seuil !== null && (Number.isNaN(seuil) || seuil > 100)) {
    return { ok: false, erreur: "Le niveau bas est un pourcentage entre 0 et 100 (laissez vide pour la valeur par défaut)." };
  }
  const deviceId = s.deviceId.trim();
  if (deviceId && !UUID.test(deviceId)) return { ok: false, erreur: "Capteur introuvable." };
  return {
    ok: true,
    champs: {
      label,
      kind: s.kind as TypeReserve,
      capacity_m3: capacite,
      shape: s.forme,
      full_height_m: pleine,
      outlet_height_m: prise,
      sensor_mounting: s.montage,
      sensor_height_m: s.montage === "distance" ? capteur : null,
      low_threshold_pct: seuil,
      device_id: deviceId || null,
    },
  };
}

export interface VueAutonomie {
  arrivee: { titre: string; ton: TonEtat; detail: string | null };
  chiffre: string;
  libelleChiffre: string;
  tonChiffre: TonEtat;
  lignes: string[];
}

const fr = (n: number, d = 1) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d }).format(n);

/** Textes de la carte d'un site (heure du site). */
export function vueAutonomie(p: {
  etat: EtatAutonomie;
  fuseau: string;
  maintenantMs: number;
  /** Début de la coupure en cours (enregistrée ou repérée). */
  coupureDebutMs: number | null;
  compteurArrivee: boolean;
}): VueAutonomie {
  const { etat: e, fuseau, maintenantMs } = p;
  const coupe = e.arrivee === "coupe";
  const arrivee =
    coupe
      ? {
          titre: "Réseau public coupé",
          ton: "danger" as const,
          detail: p.coupureDebutMs !== null ? `Plus d'eau du réseau depuis ${instantLisible(p.coupureDebutMs, fuseau, maintenantMs).replace(/^à /, "")}.` : null,
        }
      : e.arrivee === "alimente"
        ? { titre: "L'eau du réseau arrive normalement", ton: "succes" as const, detail: null }
        : {
            titre: "Arrivée du réseau non suivie",
            ton: "neutre" as const,
            detail: p.compteurArrivee
              ? "Le compteur d'arrivée ne transmet plus : une coupure ne peut pas être repérée."
              : "Désignez le compteur d'arrivée du réseau public pour repérer les coupures.",
          };
  const chiffre = e.auDelaHorizon
    ? `plus de ${HORIZON_H / 24} jours`
    : e.autonomieH !== null
      ? dureeLisible(e.autonomieH)
      : "—";
  const lignes: string[] = [];
  if (e.sousSeuil) lignes.push("Réserves sous le niveau bas réglé.");
  else if (coupe && e.heureSeuilBasMs !== null) {
    lignes.push(`Niveau bas prévu ${instantLisible(e.heureSeuilBasMs, fuseau, maintenantMs)}, heure du site.`);
  }
  lignes.push(phraseReserves(e));
  if (e.consommationM3h !== null) {
    lignes.push(
      `Consommation réelle : ${fr(e.consommationM3h, 2)} m³/h en moyenne sur 24 h${e.consommationEstimee ? " (estimée d'après la baisse du niveau)" : ""}.`,
    );
  }
  return {
    arrivee,
    chiffre,
    libelleChiffre: e.autonomieH === null && !e.auDelaHorizon
      ? "autonomie non calculable pour l'instant"
      : coupe
        ? "d'autonomie au rythme de consommation réel"
        : "d'autonomie si le réseau coupait maintenant",
    tonChiffre: e.sousSeuil ? "danger" : coupe ? "attention" : "neutre",
    lignes,
  };
}
