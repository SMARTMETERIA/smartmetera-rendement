// État affiché en tête de « Mes sites » et de la fiche d'un site (pur,
// testable). Jamais « sous surveillance » quand ce n'est pas vrai : sans
// capteur posé, ou quand des capteurs ne transmettent plus, aucune fuite ne
// peut être repérée sur ces points (aucune garantie de détection promise).

export interface EntreeEtat {
  /** Fuites ouvertes ou prises en charge. */
  fuites: number;
  /** Points de comptage posés et sondes de température actives. */
  pointsPoses: number;
  /** Alertes « capteur muet » en cours. */
  capteursMuets: number;
  /** Alertes « température basse » en cours. */
  temperaturesBasses: number;
  /**
   * Équipe de l'organisation : voit le détail des capteurs muets. Un
   * directeur de site reçoit un message plus général (l'alerte « capteur
   * muet » va d'abord au partenaire ou à SmartMeteria).
   */
  equipe: boolean;
}

export type TonEtat = "succes" | "attention" | "danger" | "neutre";

export interface Etat {
  titre: string;
  ton: TonEtat;
  /** Phrases à afficher sous le titre, dans l'ordre. */
  lignes: string[];
}

const pluriel = (n: number, un: string, plusieurs: string) => (n > 1 ? plusieurs : un);

export function etatSurveillance(e: EntreeEtat): Etat {
  const lignes: string[] = [];
  if (e.capteursMuets > 0 && e.pointsPoses > 0) {
    const tous = e.capteursMuets >= e.pointsPoses;
    lignes.push(
      e.equipe
        ? tous
          ? "Aucun capteur ne transmet plus : aucune fuite ne peut être repérée tant que les données manquent. Voir « Alertes »."
          : `${e.capteursMuets} ${pluriel(e.capteursMuets, "capteur ne transmet plus", "capteurs ne transmettent plus")} : aucune fuite ne peut y être repérée tant que les données manquent. Voir « Alertes ».`
        : "Certaines données n'arrivent plus : une vérification des capteurs est en cours.",
    );
  }
  if (e.temperaturesBasses > 0) {
    lignes.push(
      `Eau chaude sous le seuil sur ${e.temperaturesBasses} ${pluriel(e.temperaturesBasses, "point", "points")} : voir « Alertes ».`,
    );
  }

  if (e.fuites > 0) {
    return {
      titre: e.fuites === 1 ? "1 fuite en cours" : `${e.fuites} fuites en cours`,
      ton: "danger",
      lignes,
    };
  }
  if (e.pointsPoses === 0) {
    return {
      titre: "Aucun capteur posé",
      ton: "neutre",
      lignes: ["La surveillance commence dès la pose du premier capteur."],
    };
  }
  if (e.capteursMuets >= e.pointsPoses) {
    return { titre: "Surveillance interrompue", ton: "attention", lignes };
  }
  if (e.capteursMuets > 0) {
    return { titre: "Surveillance partielle", ton: "attention", lignes };
  }
  return {
    titre: "Sous surveillance",
    ton: e.temperaturesBasses > 0 ? "attention" : "succes",
    lignes: lignes.length
      ? lignes
      : ["Votre eau est surveillée jour et nuit : vous êtes prévenu dès qu'une fuite apparaît."],
  };
}

/** Couleur du titre (variables du thème ; l'ambre clair sert de fond, pas de texte). */
export const CLASSES_TON: Record<TonEtat, string> = {
  succes: "text-succes",
  attention: "text-attention-foreground",
  danger: "text-destructive",
  neutre: "text-foreground",
};

/** Bordure et fond de la carte d'état. */
export const CLASSES_CARTE: Record<TonEtat, string> = {
  succes: "",
  attention: "border-attention bg-attention/10",
  danger: "border-destructive/40",
  neutre: "",
};
