import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { genererModeleFicheCollecte, parserFicheCollecte } from "./ficheCollecte";

describe("fiche de collecte : aller-retour modele -> analyse", () => {
  it("le modele genere s'analyse sans erreur et retrouve les donnees attendues", () => {
    const bytes = genererModeleFicheCollecte();
    const resultat = parserFicheCollecte(bytes);

    expect(resultat.erreurs).toEqual([]);
    expect(resultat.service).toEqual({
      nom: "Regie des Eaux de l'Exemple",
      lineaireReseauKm: 250,
      nbAbonnes: 8000,
      zoneRepartitionEaux: false,
      prixM3Eur: 2.1,
    });
    expect(resultat.secteurs).toHaveLength(2);
    expect(resultat.secteurs[0]).toEqual({
      code: "SECT-01",
      nom: "Secteur Centre",
      nbAbonnes: 4000,
      lineaireKm: 120,
    });
    expect(resultat.compteurs).toHaveLength(2);
    expect(resultat.compteurs[1]).toEqual({
      numeroSerie: "SECT-01-A",
      nom: "Secteur Centre - Entree A",
      type: "sectorisation",
      secteurCode: "SECT-01",
      diametreMm: 150,
    });
    expect(resultat.sources).toHaveLength(2);
    expect(resultat.sources[1]).toEqual({
      nom: "Capteurs LoRaWAN sectorisation",
      type: "webhook_lorawan",
    });
  });
});

describe("parserFicheCollecte : validation", () => {
  it("signale un type de compteur inconnu avec le numero de ligne", () => {
    const classeur = buildClasseur({
      Compteurs: [{ "Numero de serie": "X-1", Nom: "Test", Type: "inconnu" }],
    });
    const resultat = parserFicheCollecte(classeur);
    expect(resultat.compteurs).toHaveLength(0);
    expect(resultat.erreurs[0]).toContain("ligne 2");
    expect(resultat.erreurs[0]).toContain("type");
  });

  it("ignore silencieusement les lignes vides mais signale les lignes partiellement remplies", () => {
    const classeur = buildClasseur({
      Secteurs: [
        { Code: "", Nom: "", "Nombre abonnes": "", "Lineaire (km)": "" },
        { Code: "SECT-01", Nom: "", "Nombre abonnes": "100", "Lineaire (km)": "" },
      ],
    });
    const resultat = parserFicheCollecte(classeur);
    expect(resultat.secteurs).toHaveLength(0);
    expect(resultat.erreurs).toHaveLength(1);
  });

  it("un fichier illisible renvoie une erreur claire plutot que de planter", () => {
    const resultat = parserFicheCollecte(new Uint8Array([1, 2, 3]));
    expect(resultat.erreurs[0]).toContain("illisible");
  });
});

// Construit un classeur XLSX minimal en octets pour les tests de validation.
function buildClasseur(feuilles: Record<string, Record<string, unknown>[]>): Uint8Array {
  const classeur = XLSX.utils.book_new();
  for (const [nom, lignes] of Object.entries(feuilles)) {
    XLSX.utils.book_append_sheet(classeur, XLSX.utils.json_to_sheet(lignes), nom);
  }
  return XLSX.write(classeur, { type: "array", bookType: "xlsx" }) as Uint8Array;
}
