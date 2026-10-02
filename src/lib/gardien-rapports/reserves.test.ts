import { describe, expect, it } from "vitest";
import { contenuMensuel, resumeReserves, type SiteRapport } from "./contenus";
import { vueRapport } from "./affichage";
import { messageAutonomie, messageRetourReseau } from "../gardien-envois/messages";
import { MARQUE_PLATEFORME } from "../marque";

const texte = (s: string) => s.replace(/[  ]/g, " ");
const H = 3_600_000;
const debutMois = Date.UTC(2026, 8, 30, 23); // 1er octobre, minuit à Kinshasa (UTC+1)
const finMois = Date.UTC(2026, 9, 31, 23);

const site: SiteRapport = {
  id: "s1",
  nom: "Hôtel du Fleuve",
  type: "hotel",
  ville: "Kinshasa",
  pays: "CD",
  monnaie: "USD",
  fuseau: "Africa/Kinshasa",
  prixM3: null,
  uniteActivite: "nuitee",
};

describe("réserves d'eau dans le rapport mensuel", () => {
  it("coupures du mois : comptées dans le mois, la plus longue, l'autonomie la plus basse", () => {
    const r = resumeReserves({
      volumesUtilesMaxM3: [10, 28.5],
      coupures: [
        // Commencée le mois précédent : seules les heures d'octobre comptent.
        { debutMs: debutMois - 5 * H, finMs: debutMois + 7 * H, autonomieMinH: 20 },
        { debutMs: debutMois + 10 * 24 * H, finMs: debutMois + 10 * 24 * H + 18 * H, autonomieMinH: 6.5 },
        // Toujours en cours à la fin du mois.
        { debutMs: finMois - 4 * H, finMs: null, autonomieMinH: null },
        // Hors du mois.
        { debutMs: debutMois - 50 * H, finMs: debutMois - 40 * H, autonomieMinH: 1 },
      ],
      alertesNiveauBas: 1,
      debutMoisMs: debutMois,
      finMoisMs: finMois,
    });
    expect(r).toMatchObject({
      nbReserves: 2,
      volumeUtileMaxM3: 38.5,
      dureeTotaleH: 29,
      plusLongueH: 18,
      autonomieMinH: 6.5,
      alertesNiveauBas: 1,
    });
    expect(r!.coupures.map((c) => c.dureeH)).toEqual([7, 18, 4]);
    expect(resumeReserves({ volumesUtilesMaxM3: [], coupures: [], alertesNiveauBas: 0, debutMoisMs: 0, finMoisMs: 1 })).toBeNull();
  });

  it("section affichée (page et PDF), conseil sur le niveau bas, monnaie du site", () => {
    const reserves = resumeReserves({
      volumesUtilesMaxM3: [38.5],
      coupures: [{ debutMs: debutMois + 10 * 24 * H, finMs: debutMois + 10 * 24 * H + 18 * H, autonomieMinH: 6.5 }],
      alertesNiveauBas: 1,
      debutMoisMs: debutMois,
      finMoisMs: finMois,
    });
    const contenu = contenuMensuel({
      site,
      mois: "2026-10",
      joursDansMois: 31,
      jours: [{ date: "2026-10-01", volumeM3: 600 }],
      volumeMoisPrecedentM3: null,
      volumeAnDernierM3: null,
      fuitesDuMois: [],
      fuitesOuvertes: 0,
      reparees: [],
      debutMoisMs: debutMois,
      finMoisMs: finMois,
      delaiJours: 30,
      quantiteActivite: null,
      capacite: null,
      tauxOccupation: null,
      autresLitresParUnite: [],
      temperatures: [],
      reserves,
    });
    expect(contenu.conseil).toContain("Vos réserves sont descendues jusqu'au niveau bas");
    const vue = vueRapport(contenu);
    const bloc = vue.blocs.find((b) => b.titre === "Réserves d'eau et coupures du réseau")!;
    expect(bloc.lignes!.map(([l, v]) => `${l} : ${texte(v)}`)).toEqual([
      "Réserves suivies : 1 réserve, 38,5 m³ utiles",
      "Coupures du réseau public : 1 coupure, 18 h au total",
      "Autonomie la plus basse : 7 h",
      "Alertes de niveau bas : 1",
      "Coupure du 11 octobre à 00:00 : jusqu'au 11 octobre à 18:00 ; 18 h, autonomie la plus basse 7 h",
    ]);
  });

  it("rapport antérieur à la phase G11 : aucune section", () => {
    const vue = vueRapport({ ...contenuMensuel({
      site,
      mois: "2026-10",
      joursDansMois: 31,
      jours: [],
      volumeMoisPrecedentM3: null,
      volumeAnDernierM3: null,
      fuitesDuMois: [],
      fuitesOuvertes: 0,
      reparees: [],
      debutMoisMs: debutMois,
      finMoisMs: finMois,
      delaiJours: 30,
      quantiteActivite: null,
      capacite: null,
      tauxOccupation: null,
      autresLitresParUnite: [],
      temperatures: [],
    }), reserves: undefined });
    expect(vue.blocs.some((b) => b.titre.startsWith("Réserves"))).toBe(false);
  });
});

describe("messages de l'autonomie en eau", () => {
  const ctx = { marque: MARQUE_PLATEFORME, urlApp: "https://app.exemple.fr" };
  const maintenant = Date.UTC(2026, 9, 2, 10, 15);

  it("coupure : SMS court avec l'autonomie et l'heure du niveau bas (heure de Kinshasa)", () => {
    const r = messageAutonomie(ctx, {
      type: "coupure_reseau",
      titre: "Coupure du réseau public",
      description: "Plus aucune arrivée d'eau…",
      site: "Hôtel du Fleuve",
      autonomieH: 9.6,
      niveauBasMs: Date.UTC(2026, 9, 2, 16),
      fuseau: "Africa/Kinshasa",
      maintenantMs: maintenant,
    });
    expect(r.sujet).toBe("Coupure du réseau public — Hôtel du Fleuve");
    expect(texte(r.court)).toBe(
      "SmartMeteria : coupure du réseau public à Hôtel du Fleuve. Autonomie estimée : 10 h. Niveau bas prévu à 17:00. Voir : https://app.exemple.fr/sites/reserves",
    );
    expect(r.texte).toContain("Surveillance fondée sur les données transmises par les capteurs.");
    expect(r.texte).toContain("camion-citerne");
  });

  it("retour de l'eau : durée de la coupure", () => {
    const r = messageRetourReseau(ctx, {
      site: "Hôtel du Fleuve",
      debutMs: Date.UTC(2026, 9, 1, 5),
      finMs: Date.UTC(2026, 9, 1, 23),
      autonomieMinH: 4.2,
      fuseau: "Africa/Kinshasa",
    });
    expect(texte(r.court)).toBe("SmartMeteria : l'eau du réseau public est revenue à Hôtel du Fleuve après 18 h de coupure.");
    expect(texte(r.texte)).toContain("depuis le 2 octobre à 00:00, après 18 h de coupure. Autonomie la plus basse pendant la coupure : 4 h.");
  });
});
