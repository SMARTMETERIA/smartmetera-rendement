// Provisionnement en masse (pur, testable) : lecture d'un fichier CSV
// d'appareils (référence, modèle, kit, carte SIM) vers le stock, et codes
// imprimés sur les étiquettes QR.
import Papa from "papaparse";
import {
  imeiValide,
  normaliserReference,
  typeReference,
} from "@/lib/ingest/reference";
import { MODELES_CAPTEURS, trouverModele, type CleModele } from "./modeles";

export interface LigneStock {
  device_ref: string;
  modele: CleModele;
  sim_ref: string | null;
}

export interface ResultatImportStock {
  lignes: LigneStock[];
  erreurs: { ligne: number; message: string }[];
}

const ALIAS: Record<"reference" | "modele" | "kit" | "sim", string[]> = {
  reference: ["reference", "ref", "device ref", "deveui", "dev eui", "imei"],
  modele: ["modele", "model", "type"],
  kit: ["kit"],
  sim: ["sim", "sim ref", "iccid", "carte sim"],
};

function normaliserEntete(entete: string): string {
  return entete
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const LIMITE_IMPORT_STOCK = 2000;

export function analyserImportStock(texte: string): ResultatImportStock {
  const resultat = Papa.parse<Record<string, string>>(texte.trim(), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normaliserEntete,
  });
  const entetes = resultat.meta.fields ?? [];
  const colonne = (cle: keyof typeof ALIAS) =>
    entetes.find((e) => ALIAS[cle].includes(e));
  const colRef = colonne("reference");
  const colModele = colonne("modele");
  const colKit = colonne("kit");
  const colSim = colonne("sim");

  const erreurs: ResultatImportStock["erreurs"] = [];
  if (!colRef || !colModele) {
    return {
      lignes: [],
      erreurs: [
        {
          ligne: 1,
          message:
            "Colonnes attendues : « reference » (DevEUI ou IMEI) et « modele » ; « kit » et « sim » sont facultatives.",
        },
      ],
    };
  }
  if (resultat.data.length > LIMITE_IMPORT_STOCK) {
    return {
      lignes: [],
      erreurs: [
        {
          ligne: 1,
          message: `Au plus ${LIMITE_IMPORT_STOCK} appareils par fichier : découpez le fichier.`,
        },
      ],
    };
  }

  const lignes: LigneStock[] = [];
  const vues = new Set<string>();
  resultat.data.forEach((brut, i) => {
    const numero = i + 2; // ligne 1 : en-têtes
    const saisieRef = (brut[colRef] ?? "").trim();
    const ref = normaliserReference(saisieRef);
    if (!ref) {
      erreurs.push({
        ligne: numero,
        message: `Référence « ${saisieRef} » invalide : DevEUI (16 caractères hexadécimaux) ou IMEI (15 chiffres) attendu.`,
      });
      return;
    }
    if (typeReference(ref) === "imei" && !imeiValide(ref)) {
      erreurs.push({
        ligne: numero,
        message: `IMEI ${ref} invalide (chiffre de contrôle faux) : vérifiez la saisie.`,
      });
      return;
    }
    const modele = trouverModele(brut[colModele] ?? "");
    if (!modele) {
      erreurs.push({
        ligne: numero,
        message: `Modèle « ${(brut[colModele] ?? "").trim()} » inconnu : Adeunis PULSE NB-IoT/LTE-M, Milesight EM300-DI ou sonde de température.`,
      });
      return;
    }
    const attendu =
      MODELES_CAPTEURS[modele].transmission === "cellulaire"
        ? "imei"
        : "deveui";
    if (typeReference(ref) !== attendu) {
      erreurs.push({
        ligne: numero,
        message:
          attendu === "imei"
            ? `Un ${MODELES_CAPTEURS[modele].libelle} se reconnaît à son IMEI (15 chiffres).`
            : `Un ${MODELES_CAPTEURS[modele].libelle} se reconnaît à son DevEUI (16 caractères hexadécimaux).`,
      });
      return;
    }
    const kit = colKit ? (brut[colKit] ?? "").trim().toUpperCase() : "";
    const kitAttendu = MODELES_CAPTEURS[modele].kit.toUpperCase();
    if (kit && kit !== kitAttendu) {
      erreurs.push({
        ligne: numero,
        message: `Kit « ${kit} » incohérent avec le modèle (kit ${MODELES_CAPTEURS[modele].kit} attendu).`,
      });
      return;
    }
    if (vues.has(ref)) {
      erreurs.push({
        ligne: numero,
        message: `Référence ${ref} en double dans le fichier.`,
      });
      return;
    }
    vues.add(ref);
    const sim = colSim ? (brut[colSim] ?? "").trim() : "";
    lignes.push({
      device_ref: ref,
      modele,
      sim_ref: sim ? sim.slice(0, 40) : null,
    });
  });

  return { lignes, erreurs };
}

// Code imprimé sous le QR : sans caractères ambigus (0/O, 1/I).
const ALPHABET_CODE = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function genererCodeQr(
  aleatoire: (n: number) => Uint8Array = (n) =>
    crypto.getRandomValues(new Uint8Array(n)),
): string {
  const octets = aleatoire(10);
  let code = "";
  for (const o of octets) code += ALPHABET_CODE[o % ALPHABET_CODE.length];
  return code;
}

/** Adresse ouverte en scannant l'étiquette : l'assistant de pose pré-rempli. */
export function lienPose(site: string, code: string): string {
  return `${site.replace(/\/+$/, "")}/pose/${encodeURIComponent(code)}`;
}
