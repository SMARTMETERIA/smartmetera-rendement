// Fiche de collecte : modele Excel a 4 onglets (Service, Secteurs,
// Compteurs, Sources) pour creer en un clic la structure de depart d'une
// nouvelle organisation depuis l'espace superadmin (/admin). Generation du
// modele et analyse du fichier rempli, 100% cote navigateur (SheetJS deja
// utilise par l'assistant d'import, voir src/lib/import/parseExcel.ts).
//
// Les en-tetes de colonnes evitent volontairement toute apostrophe (risque
// d'ambiguite entre apostrophe courbe/droite selon l'editeur utilise pour
// remplir le fichier) : "Nombre abonnes" plutot que "Nombre d'abonnes".
import * as XLSX from "xlsx";
import { normalizeHeader } from "../import/headers";

export interface FicheCollecteService {
  nom: string;
  lineaireReseauKm: number | null;
  nbAbonnes: number | null;
  zoneRepartitionEaux: boolean;
  prixM3Eur: number | null;
}

export interface FicheCollecteSecteur {
  code: string;
  nom: string;
  nbAbonnes: number | null;
  lineaireKm: number | null;
}

export const TYPES_COMPTEUR = [
  "production",
  "import",
  "export",
  "sectorisation",
  "comptage_abonne",
  "service",
] as const;

export interface FicheCollecteCompteur {
  numeroSerie: string;
  nom: string;
  type: string;
  secteurCode: string | null;
  diametreMm: number | null;
}

export const TYPES_SOURCE = [
  "export_csv",
  "webhook_lorawan",
  "saisie_manuelle",
  "api",
  "email_entrant",
] as const;

export interface FicheCollecteSource {
  nom: string;
  type: string;
}

export interface ResultatFicheCollecte {
  service: FicheCollecteService | null;
  secteurs: FicheCollecteSecteur[];
  compteurs: FicheCollecteCompteur[];
  sources: FicheCollecteSource[];
  erreurs: string[];
}

const NOMS_ONGLETS = {
  service: "Service",
  secteurs: "Secteurs",
  compteurs: "Compteurs",
  sources: "Sources",
};

function trouverFeuille(classeur: XLSX.WorkBook, nom: string): XLSX.WorkSheet | null {
  const nomNormalise = normalizeHeader(nom);
  const nomReel = classeur.SheetNames.find((n) => normalizeHeader(n) === nomNormalise);
  return nomReel ? classeur.Sheets[nomReel] : null;
}

function lignesDeFeuille(feuille: XLSX.WorkSheet): Record<string, string>[] {
  const brut = XLSX.utils.sheet_to_json<Record<string, unknown>>(feuille, {
    raw: false,
    defval: "",
  });
  return brut.map((ligne) => {
    const normalisee: Record<string, string> = {};
    for (const [cle, valeur] of Object.entries(ligne)) {
      normalisee[normalizeHeader(cle)] = String(valeur ?? "").trim();
    }
    return normalisee;
  });
}

function nombreOuNull(v: string): number | null {
  if (v === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function ouiNon(v: string): boolean {
  return normalizeHeader(v) === "oui";
}

function ligneNonVide(ligne: Record<string, string>): boolean {
  return Object.values(ligne).some((v) => v !== "");
}

export function parserFicheCollecte(bytes: Uint8Array): ResultatFicheCollecte {
  const erreurs: string[] = [];
  let classeur: XLSX.WorkBook;
  try {
    classeur = XLSX.read(bytes, { type: "array" });
  } catch {
    return {
      service: null,
      secteurs: [],
      compteurs: [],
      sources: [],
      erreurs: ["Fichier illisible : est-ce bien un fichier Excel (.xlsx) ?"],
    };
  }

  const aucunOngletReconnu = Object.values(NOMS_ONGLETS).every(
    (nom) => trouverFeuille(classeur, nom) === null,
  );
  if (aucunOngletReconnu) {
    return {
      service: null,
      secteurs: [],
      compteurs: [],
      sources: [],
      erreurs: [
        "Fichier illisible : aucun onglet Service/Secteurs/Compteurs/Sources reconnu. Est-ce bien un fichier Excel (.xlsx) issu du modele ?",
      ],
    };
  }

  let service: FicheCollecteService | null = null;
  const feuilleService = trouverFeuille(classeur, NOMS_ONGLETS.service);
  if (feuilleService) {
    const ligne = lignesDeFeuille(feuilleService)[0];
    if (!ligne || !ligne["nom"]) {
      erreurs.push('Onglet Service : colonne "Nom" manquante ou vide.');
    } else {
      service = {
        nom: ligne["nom"],
        lineaireReseauKm: nombreOuNull(ligne["lineaire reseau (km)"] ?? ""),
        nbAbonnes: nombreOuNull(ligne["nombre abonnes"] ?? ""),
        zoneRepartitionEaux: ouiNon(ligne["zone de repartition des eaux (oui/non)"] ?? ""),
        prixM3Eur: nombreOuNull(ligne["prix moyen eau (eur/m3)"] ?? ""),
      };
    }
  }

  const secteurs: FicheCollecteSecteur[] = [];
  const feuilleSecteurs = trouverFeuille(classeur, NOMS_ONGLETS.secteurs);
  if (feuilleSecteurs) {
    lignesDeFeuille(feuilleSecteurs).forEach((ligne, i) => {
      if (!ligne["code"] || !ligne["nom"]) {
        if (ligneNonVide(ligne)) erreurs.push(`Onglet Secteurs, ligne ${i + 2} : code ou nom manquant.`);
        return;
      }
      secteurs.push({
        code: ligne["code"],
        nom: ligne["nom"],
        nbAbonnes: nombreOuNull(ligne["nombre abonnes"] ?? ""),
        lineaireKm: nombreOuNull(ligne["lineaire (km)"] ?? ""),
      });
    });
  }

  const compteurs: FicheCollecteCompteur[] = [];
  const feuilleCompteurs = trouverFeuille(classeur, NOMS_ONGLETS.compteurs);
  if (feuilleCompteurs) {
    lignesDeFeuille(feuilleCompteurs).forEach((ligne, i) => {
      const numeroSerie = ligne["numero de serie"] ?? "";
      const nom = ligne["nom"] ?? "";
      const type = normalizeHeader(ligne["type"] ?? "");
      if (!numeroSerie || !nom) {
        if (ligneNonVide(ligne)) {
          erreurs.push(`Onglet Compteurs, ligne ${i + 2} : numero de serie ou nom manquant.`);
        }
        return;
      }
      if (!(TYPES_COMPTEUR as readonly string[]).includes(type)) {
        erreurs.push(
          `Onglet Compteurs, ligne ${i + 2} : type "${ligne["type"]}" inconnu (attendu : ${TYPES_COMPTEUR.join(", ")}).`,
        );
        return;
      }
      compteurs.push({
        numeroSerie,
        nom,
        type,
        secteurCode: ligne["secteur"] || null,
        diametreMm: nombreOuNull(ligne["diametre (mm)"] ?? ""),
      });
    });
  }

  const sources: FicheCollecteSource[] = [];
  const feuilleSources = trouverFeuille(classeur, NOMS_ONGLETS.sources);
  if (feuilleSources) {
    lignesDeFeuille(feuilleSources).forEach((ligne, i) => {
      const nom = ligne["nom"] ?? "";
      const type = normalizeHeader(ligne["type"] ?? "");
      if (!nom) {
        if (ligneNonVide(ligne)) erreurs.push(`Onglet Sources, ligne ${i + 2} : nom manquant.`);
        return;
      }
      if (!(TYPES_SOURCE as readonly string[]).includes(type)) {
        erreurs.push(
          `Onglet Sources, ligne ${i + 2} : type "${ligne["type"]}" inconnu (attendu : ${TYPES_SOURCE.join(", ")}).`,
        );
        return;
      }
      sources.push({ nom, type });
    });
  }

  return { service, secteurs, compteurs, sources, erreurs };
}

export function genererModeleFicheCollecte(): Uint8Array {
  const classeur = XLSX.utils.book_new();

  const service = XLSX.utils.json_to_sheet([
    {
      Nom: "Regie des Eaux de l'Exemple",
      "Lineaire reseau (km)": 250,
      "Nombre abonnes": 8000,
      "Zone de repartition des eaux (Oui/Non)": "Non",
      "Prix moyen eau (EUR/m3)": 2.1,
    },
  ]);
  XLSX.utils.book_append_sheet(classeur, service, NOMS_ONGLETS.service);

  const secteurs = XLSX.utils.json_to_sheet([
    { Code: "SECT-01", Nom: "Secteur Centre", "Nombre abonnes": 4000, "Lineaire (km)": 120 },
    { Code: "SECT-02", Nom: "Secteur Nord", "Nombre abonnes": 4000, "Lineaire (km)": 130 },
  ]);
  XLSX.utils.book_append_sheet(classeur, secteurs, NOMS_ONGLETS.secteurs);

  const compteurs = XLSX.utils.json_to_sheet([
    { "Numero de serie": "PROD-001", Nom: "Production - Station A", Type: "production", Secteur: "", "Diametre (mm)": "" },
    { "Numero de serie": "SECT-01-A", Nom: "Secteur Centre - Entree A", Type: "sectorisation", Secteur: "SECT-01", "Diametre (mm)": 150 },
  ]);
  XLSX.utils.book_append_sheet(classeur, compteurs, NOMS_ONGLETS.compteurs);

  const sources = XLSX.utils.json_to_sheet([
    { Nom: "Export mensuel logiciel client", Type: "export_csv" },
    { Nom: "Capteurs LoRaWAN sectorisation", Type: "webhook_lorawan" },
  ]);
  XLSX.utils.book_append_sheet(classeur, sources, NOMS_ONGLETS.sources);

  return XLSX.write(classeur, { type: "array", bookType: "xlsx" }) as Uint8Array;
}
