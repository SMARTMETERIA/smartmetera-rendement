// Références d'appareils : DevEUI LoRaWAN (16 caractères hexadécimaux) ou
// IMEI cellulaire (15 chiffres, dernier chiffre de contrôle de Luhn).

const DEVEUI = /^[0-9A-F]{16}$/;
const IMEI = /^\d{15}$/;

export function imeiValide(imei: string): boolean {
  if (!IMEI.test(imei)) return false;
  let somme = 0;
  for (let i = 0; i < 15; i++) {
    let chiffre = Number(imei[14 - i]);
    if (i % 2 === 1) {
      chiffre *= 2;
      if (chiffre > 9) chiffre -= 9;
    }
    somme += chiffre;
  }
  return somme % 10 === 0;
}

/**
 * Référence normalisée (DevEUI en majuscules sans séparateurs, IMEI en
 * chiffres), ou null si la saisie n'est ni l'un ni l'autre.
 */
export function normaliserReference(brut: string): string | null {
  const compact = brut.trim().replace(/[\s:.-]/g, "").toUpperCase();
  if (DEVEUI.test(compact)) return compact;
  if (IMEI.test(compact)) return compact;
  return null;
}

export function typeReference(ref: string): "deveui" | "imei" | null {
  if (DEVEUI.test(ref)) return "deveui";
  if (IMEI.test(ref)) return "imei";
  return null;
}

/**
 * IMEI contenu dans un identifiant MQTT ou Live Objects :
 * « urn:imei:351358816993213 », « urn:lo:nsid:imei:351358816993213 ».
 */
export function imeiDepuisIdentifiant(texte: unknown): string | null {
  if (typeof texte !== "string") return null;
  const m = texte.match(/imei:\s*(\d{15})\b/i);
  return m ? m[1] : null;
}
