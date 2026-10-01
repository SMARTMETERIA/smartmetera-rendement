import { describe, expect, it } from "vitest";
import { MARQUE_PLATEFORME } from "../marque";
import {
  intervalleAttenduMinutes,
  lignesSurveillance,
  messageRecapitulatif,
  problemes,
  type EtatTaches,
} from "./surveillance";

const MAINTENANT = Date.parse("2026-09-30T08:00:00Z");
const ilYa = (minutes: number) => new Date(MAINTENANT - minutes * 60_000).toISOString();

describe("intervalle attendu d'une planification", () => {
  it.each([
    ["*/15 * * * *", 15],
    ["10 * * * *", 60],
    ["40 3 * * *", 24 * 60],
    ["0 */6 * * *", 6 * 60],
    ["0 7 * * 1", 7 * 24 * 60],
    ["0 0 25 * *", 31 * 24 * 60],
    ["* * * * *", 1],
  ])("%s → %i minutes", (planification, minutes) => {
    expect(intervalleAttenduMinutes(planification)).toBe(minutes);
  });

  it("ne devine pas une planification inconnue", () => {
    expect(intervalleAttenduMinutes("30 seconds")).toBeNull();
    expect(intervalleAttenduMinutes("1-5 * * * *")).toBeNull();
  });
});

function etat(partiel: Partial<EtatTaches>): EtatTaches {
  return { maintenant: new Date(MAINTENANT).toISOString(), cron: [], fonctions: [], appels_http: null, ...partiel };
}

const cron = (nom: string, planification: string, derniers: Partial<EtatTaches["cron"][number]> = {}) => ({
  nom,
  planification,
  active: true,
  dernier_debut: ilYa(5),
  derniere_fin: ilYa(5),
  dernier_statut: "succeeded",
  dernier_message: "1 row",
  echecs_24h: 0,
  ...derniers,
});

const fonction = (tache: string, derniers: Partial<EtatTaches["fonctions"][number]> = {}) => ({
  tache,
  dernier_debut: ilYa(5),
  derniere_fin: ilYa(4),
  dernier_statut: "ok",
  dernieres_erreurs: [],
  passages_24h: 96,
  echecs_24h: 0,
  ...derniers,
});

describe("état des tâches", () => {
  it("prend l'état écrit par la fonction pour une tâche pg_cron qui l'appelle", () => {
    const lignes = lignesSurveillance(
      etat({
        cron: [cron("gardien-envois", "*/15 * * * *")],
        fonctions: [fonction("gardien-envois", { dernier_statut: "partiel", dernieres_erreurs: ["rapports x : délai dépassé", "y"], echecs_24h: 2 })],
      }),
      MAINTENANT,
    );
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({
      cle: "gardien-envois",
      libelle: "Alertes, rapports et pilotes",
      etat: "en_echec",
      echecs24h: 2,
      detail: "rapports x : délai dépassé (et 1 autre)",
    });
  });

  it("signale une fonction qui ne passe plus (appel perdu, plantage)", () => {
    const [ligne] = lignesSurveillance(
      etat({ cron: [cron("gardien-moteur", "10 * * * *")], fonctions: [fonction("gardien-moteur", { dernier_debut: ilYa(3 * 60) })] }),
      MAINTENANT,
    );
    expect(ligne.etat).toBe("en_retard");
  });

  it("à l'heure, jamais lancée, désactivée, échec SQL ; les problèmes d'abord", () => {
    const lignes = lignesSurveillance(
      etat({
        cron: [
          cron("unknown-frames-purge", "30 3 * * *", { dernier_debut: ilYa(5 * 60) }),
          cron("gardien-moteur", "10 * * * *"),
          cron("notifications-alertes", "*/15 * * * *", { active: false }),
          cron("readings-ensure-next-partition", "0 0 25 * *", { dernier_statut: "failed", dernier_message: "ERROR: x" }),
        ],
        fonctions: [fonction("recapitulatif-quotidien", { dernier_debut: ilYa(60) })],
      }),
      MAINTENANT,
    );
    expect(lignes.map((l) => [l.cle, l.etat])).toEqual([
      ["readings-ensure-next-partition", "en_echec"],
      ["gardien-moteur", "jamais"],
      ["notifications-alertes", "inactive"],
      ["unknown-frames-purge", "a_l_heure"],
      ["recapitulatif-quotidien", "a_l_heure"],
    ]);
    expect(lignes[0].detail).toBe("ERROR: x");
    expect(problemes(lignes).map((l) => l.cle)).toEqual(["readings-ensure-next-partition"]);
  });
});

describe("récapitulatif quotidien", () => {
  const base = {
    jour: "2026-09-30",
    appelsHttp: { echecs_6h: 0, total_6h: 30 },
    envois: { envoyes: 12, echecs: 1, journalises: 3 },
    fuitesDetectees: 2,
    tachesAFaire: 4,
    pilotes: [{ site: "Hôtel Bellecour", organisation: "Hôtel Bellecour Démo", fin: "2026-10-05" }],
    essais: [{ organisation: "Camping des Pins", fin: "2026-10-02" }],
  };

  it("dit que tout va bien, avec les chiffres, les pilotes et les essais qui finissent", () => {
    const m = messageRecapitulatif(MARQUE_PLATEFORME, "https://app.smartmeteria.com", { ...base, taches: [] });
    expect(m.sujet).toBe("Récapitulatif du 30 septembre 2026");
    expect(m.texte).toContain("Toutes les tâches planifiées sont passées à l'heure.");
    expect(m.texte).toContain("Messages en échec (24 h) : 1");
    expect(m.texte).toContain("Hôtel Bellecour (Hôtel Bellecour Démo) : 5 octobre 2026");
    expect(m.texte).toContain("Camping des Pins : 2 octobre 2026");
    expect(m.texte).toContain("https://app.smartmeteria.com/admin");
    expect(m.html).toContain("SmartMeteria");
  });

  it("liste les tâches à regarder", () => {
    const m = messageRecapitulatif(MARQUE_PLATEFORME, "https://app.smartmeteria.com", {
      ...base,
      appelsHttp: { echecs_6h: 3, total_6h: 30 },
      taches: [
        { cle: "gardien-moteur", libelle: "Détection des fuites et des températures", planification: "10 * * * *", dernierPassage: ilYa(300), etat: "en_retard", echecs24h: 0, detail: null },
      ],
    });
    expect(m.texte).toContain("À regarder : une tâche planifiée en échec ou en retard.");
    expect(m.texte).toContain("Détection des fuites et des températures : en retard");
    expect(m.texte).toContain("Appels de fonctions en échec (6 h) : 3 sur 30");
  });
});
