import { describe, expect, it } from "vitest";
import { analyserImportStock, genererCodeQr, lienPose } from "./stock";
import {
  GABARIT_A4_24,
  MM,
  positionsEtiquettes,
  referenceCourte,
} from "./etiquettes";
import { etapeAttente, verifierPoidsImpulsion } from "./pose";
import {
  MODELES_CAPTEURS,
  modeleDepuisDecodeur,
  trouverModele,
} from "./modeles";

describe("import du stock", () => {
  it("accepte un fichier au point-virgule avec en-têtes accentués", () => {
    const r = analyserImportStock(
      [
        "Référence;Modèle;Kit;SIM",
        "351358816993213;Adeunis PULSE NB-IoT/LTE-M;A;8933150123456789012",
        "24-E1-24-13-6B-12-34-AB;Milesight EM300-DI;C;",
        "A84041000181C0DE;sonde de température;sonde;",
      ].join("\n"),
    );
    expect(r.erreurs).toEqual([]);
    expect(r.lignes).toEqual([
      {
        device_ref: "351358816993213",
        modele: "adeunis_pulse_nbiot",
        sim_ref: "8933150123456789012",
      },
      {
        device_ref: "24E124136B1234AB",
        modele: "milesight_em300_di",
        sim_ref: null,
      },
      {
        device_ref: "A84041000181C0DE",
        modele: "sonde_temperature",
        sim_ref: null,
      },
    ]);
  });

  it("signale chaque ligne fautive avec son numéro", () => {
    const r = analyserImportStock(
      [
        "reference,modele",
        "351358816993214,adeunis", // clé IMEI fausse
        "24E124136B1234AB,adeunis", // DevEUI pour un appareil cellulaire
        "351358816993213,compteur inconnu",
        "xyz,em300",
        "351358816993213,adeunis",
        "351358816993213,adeunis", // doublon
      ].join("\n"),
    );
    expect(r.lignes).toHaveLength(1);
    expect(r.erreurs.map((e) => e.ligne)).toEqual([2, 3, 4, 5, 7]);
  });

  it("exige les colonnes référence et modèle", () => {
    const r = analyserImportStock("imei;sim\n351358816993213;x");
    expect(r.lignes).toEqual([]);
    expect(r.erreurs[0].message).toMatch(/modele/);
  });

  it("refuse un kit incohérent", () => {
    const r = analyserImportStock("ref;modele;kit\n351358816993213;adeunis;C");
    expect(r.erreurs[0].message).toMatch(/kit A attendu/);
  });
});

describe("codes QR", () => {
  it("produit 10 caractères sans ambiguïté de lecture", () => {
    const code = genererCodeQr();
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{10}$/);
    expect(genererCodeQr(() => new Uint8Array(10))).toBe("2222222222");
  });

  it("ouvre l'assistant de pose", () => {
    expect(lienPose("https://app.smartmeteria.com/", "ABCD234567")).toBe(
      "https://app.smartmeteria.com/pose/ABCD234567",
    );
  });
});

describe("planche d'étiquettes A4", () => {
  it("place 24 étiquettes par page, de gauche à droite et de haut en bas", () => {
    const p = positionsEtiquettes(26);
    expect(p[0]).toEqual({
      page: 0,
      x: 0,
      y: GABARIT_A4_24.hauteurPage - 0.5 * MM - 37 * MM,
    });
    expect(p[1].x).toBeCloseTo(70 * MM);
    expect(p[3]).toMatchObject({ page: 0, x: 0 });
    expect(p[3].y).toBeCloseTo(p[0].y - 37 * MM);
    expect(p[23].page).toBe(0);
    expect(p[24]).toEqual({ ...p[0], page: 1 });
    expect(p[25].page).toBe(1);
  });

  it("tient dans la page", () => {
    for (const pos of positionsEtiquettes(24)) {
      expect(pos.x + GABARIT_A4_24.largeur).toBeLessThanOrEqual(
        GABARIT_A4_24.largeurPage + 0.01,
      );
      expect(pos.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("raccourcit les références", () => {
    expect(referenceCourte("351358816993213")).toBe("…16993213");
    expect(referenceCourte("ABC")).toBe("ABC");
  });
});

describe("vérification du poids d'impulsion", () => {
  it("valide un réglage juste", () => {
    expect(
      verifierPoidsImpulsion({
        indexPoseM3: 1200,
        indexLuM3: 1203,
        volumeMesureM3: 2.9,
        poidsActuelL: 10,
      }),
    ).toMatchObject({ statut: "correct" });
  });

  it("propose le bon poids quand le rapport vaut 10", () => {
    expect(
      verifierPoidsImpulsion({
        indexPoseM3: 1200,
        indexLuM3: 1205,
        volumeMesureM3: 0.5,
        poidsActuelL: 1,
      }),
    ).toMatchObject({ statut: "a_corriger", poidsSuggere: 10 });
  });

  it("attend qu'assez d'eau soit passée", () => {
    expect(
      verifierPoidsImpulsion({
        indexPoseM3: 10,
        indexLuM3: 10.01,
        volumeMesureM3: 0.01,
        poidsActuelL: 1,
      }),
    ).toMatchObject({ statut: "insuffisant" });
  });

  it("signale un index lu impossible ou un écart inexplicable", () => {
    expect(
      verifierPoidsImpulsion({
        indexPoseM3: 10,
        indexLuM3: 9,
        volumeMesureM3: 1,
        poidsActuelL: 1,
      }),
    ).toMatchObject({ statut: "incoherent" });
    expect(
      verifierPoidsImpulsion({
        indexPoseM3: 0,
        indexLuM3: 3.3,
        volumeMesureM3: 1,
        poidsActuelL: 10,
      }),
    ).toMatchObject({ statut: "incoherent" });
  });
});

describe("robinet test", () => {
  const base = {
    nature: "eau" as const,
    premiere_donnee_at: null,
    ecoulement_detecte_at: null,
    temperature_c: null,
    expected_first_data_at: "2026-09-28T15:00:00Z",
  };

  it("annonce l'heure attendue, puis les données, puis le feu vert", () => {
    expect(etapeAttente(base)).toEqual({
      etape: "attente",
      heureAttendue: "2026-09-28T15:00:00Z",
    });
    expect(etapeAttente({ ...base, premiere_donnee_at: "x" })).toEqual({
      etape: "donnees_recues",
    });
    expect(
      etapeAttente({
        ...base,
        premiere_donnee_at: "x",
        ecoulement_detecte_at: "y",
      }),
    ).toEqual({ etape: "feu_vert" });
  });

  it("passe au vert à la première température pour une sonde", () => {
    expect(
      etapeAttente({ ...base, nature: "temperature", temperature_c: 57 }),
    ).toEqual({
      etape: "feu_vert",
    });
  });
});

describe("catalogue des capteurs", () => {
  it("reconnaît les modèles saisis librement", () => {
    expect(trouverModele("ARF8420AA")).toBe("adeunis_pulse_nbiot");
    expect(trouverModele("em300-di")).toBe("milesight_em300_di");
    expect(trouverModele("Sonde")).toBe("sonde_temperature");
    expect(trouverModele("")).toBeNull();
  });

  it("retrouve le modèle d'un appareil par son décodeur", () => {
    expect(modeleDepuisDecodeur("adeunis_pulse_mqtt")).toBe(
      "adeunis_pulse_nbiot",
    );
    expect(modeleDepuisDecodeur("inconnu")).toBeNull();
  });

  it("demande des relevés au moins horaires au kit A", () => {
    expect(
      MODELES_CAPTEURS.adeunis_pulse_nbiot.intervalleEmissionS,
    ).toBeLessThanOrEqual(3600);
    expect(MODELES_CAPTEURS.adeunis_pulse_nbiot.voies).toEqual(["A", "B"]);
  });
});
