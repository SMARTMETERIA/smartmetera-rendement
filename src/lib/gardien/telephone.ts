// Numéro de téléphone d'alerte au format international (+33…, +212…,
// +243…), à partir de ce que la personne tape (« 06 12 34 56 78 », « 0033… »).

const INDICATIFS: Record<string, string> = { FR: "33", MA: "212", CD: "243" };

export type Telephone = { ok: true; numero: string | null } | { ok: false; erreur: string };

export function normaliserTelephone(saisie: string, pays: string): Telephone {
  const brut = saisie.replace(/[\s.\-()]/g, "");
  if (brut === "") return { ok: true, numero: null };
  let numero = brut;
  if (numero.startsWith("00")) numero = `+${numero.slice(2)}`;
  if (/^0[1-9]\d{8}$/.test(numero)) numero = `+${INDICATIFS[pays] ?? "33"}${numero.slice(1)}`;
  if (!/^\+[1-9]\d{7,14}$/.test(numero)) {
    return {
      ok: false,
      erreur: "Numéro invalide : tapez par exemple 06 12 34 56 78 ou +33 6 12 34 56 78.",
    };
  }
  return { ok: true, numero };
}

/** Affichage lisible : « +33 6 12 34 56 78 », « +243 81 234 5678 ». */
export function formaterTelephone(numero: string): string {
  const rdc = numero.match(/^\+243(\d{2})(\d{3})(\d{4})$/);
  if (rdc) return `+243 ${rdc[1]} ${rdc[2]} ${rdc[3]}`;
  const m = numero.match(/^\+(33|212)(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/);
  return m ? `+${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]} ${m[6]}` : numero;
}
