import { describe, it, expect } from "vitest";
import { assemblerContenuRapportMensuel } from "./assemblerContenu";

describe("assemblerContenuRapportMensuel", () => {
  it("associe la dernière nightline de chaque secteur et calcule le volume total récupéré", () => {
    const contenu = assemblerContenuRapportMensuel({
      organisationNom: "Régie des Sources",
      lineaireReseauKm: 800,
      nbAbonnes: 20000,
      zoneRepartitionEaux: false,
      mois: 9,
      annee: 2026,
      genereLe: "2026-10-01T05:00:00.000Z",
      bilan: {
        periode_debut: "2025-10-01",
        periode_fin: "2026-09-30",
        rendement: 0.625,
        seuil_reglementaire: 0.6586,
        distance_seuil: -0.0336,
        conforme_decret: false,
        ilp: 2.568,
        ilc: 4.281,
        v_produit: 2000000,
        v_importe: 0,
        v_exporte: 0,
        v_comptabilise: 1220000,
        v_sans_comptage: 10000,
        v_service: 20000,
        v_mise_en_distribution: 2000000,
        v_consomme_autorise: 1250000,
        pertes: 750000,
      },
      secteurs: [{ nom: "Secteur Centre", nb_abonnes: 6500, lineaire_km: 260 }],
      dernieresNightlines: new Map([
        [
          "sect-2",
          {
            sector_id: "sect-2",
            debit_min_nocturne_m3h: 5.2,
            baseline_m3h: 3.1,
            volume_fuite_estime_m3j: 42,
            nuit_date: "2026-09-30",
          },
        ],
      ]),
      secteursIdParNom: new Map([["Secteur Centre", "sect-2"]]),
      alertes: [
        {
          titre: "Fuite suspectée : Secteur Centre",
          type: "fuite_suspectee",
          severite: "haute",
          declenchee_le: "2026-09-28T03:00:00.000Z",
          sector_nom: "Secteur Centre",
        },
      ],
      interventions: [
        {
          type: "reparation",
          statut: "terminee",
          sector_nom: "Secteur Centre",
          date: "2026-09-29",
          volume_recupere_m3j: 38,
          resultat: "Fuite réparée rue des Lilas",
        },
        {
          type: "recherche_fuite",
          statut: "terminee",
          sector_nom: "Secteur Centre",
          date: "2026-09-27",
          volume_recupere_m3j: null,
          resultat: "Localisation en cours",
        },
      ],
      planActions: {
        nom: "Plan 2026-2028",
        annee_debut: 2026,
        annee_fin: 2028,
        actions: [
          {
            titre: "Renouveler les canalisations les plus anciennes",
            categorie: "renouvellement",
            statut: "en_cours",
            priorite: "haute",
            echeance: "2027-06-30",
          },
        ],
      },
    });

    expect(contenu.secteurs[0].dernierDmnM3h).toBe(5.2);
    expect(contenu.secteurs[0].derniereFuiteEstimeeM3j).toBe(42);
    expect(contenu.volumeTotalRecupereM3j).toBe(38);
    expect(contenu.alertes).toHaveLength(1);
    expect(contenu.interventions).toHaveLength(2);
    expect(contenu.bilan?.rendement).toBeCloseTo(0.625);
    expect(contenu.planActions?.actions[0].titre).toContain("Renouveler");
  });

  it("gère l'absence de bilan et de plan d'actions", () => {
    const contenu = assemblerContenuRapportMensuel({
      organisationNom: "Régie des Sources",
      lineaireReseauKm: null,
      nbAbonnes: null,
      zoneRepartitionEaux: false,
      mois: 1,
      annee: 2026,
      genereLe: "2026-02-01T05:00:00.000Z",
      bilan: null,
      secteurs: [],
      dernieresNightlines: new Map(),
      secteursIdParNom: new Map(),
      alertes: [],
      interventions: [],
      planActions: null,
    });

    expect(contenu.bilan).toBeNull();
    expect(contenu.planActions).toBeNull();
    expect(contenu.volumeTotalRecupereM3j).toBe(0);
  });
});
