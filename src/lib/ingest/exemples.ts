// Construit des trames d'exemple pour chaque décodeur (utilisé par le
// testeur de trame de /parametres/sources et par les tests d'aller-retour
// ci-dessous). Inverse des décodeurs de src/lib/ingest/decoders/*.
import { bytesToHex } from "./bytes";

function u32be(n: number): string {
  const b = new Uint8Array(4);
  b[0] = (n >>> 24) & 0xff;
  b[1] = (n >>> 16) & 0xff;
  b[2] = (n >>> 8) & 0xff;
  b[3] = n & 0xff;
  return bytesToHex(b);
}

function u32le(n: number): string {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  b[2] = (n >>> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return bytesToHex(b);
}

export function exempleAdeunisPulseV4(compteurA: number, compteurB: number): string {
  return "46" + "20" + u32be(compteurA) + u32be(compteurB);
}

const FCTRL_PAR_CANAL: Record<string, number> = { "1": 0x11, "2": 0x31, "3": 0x51 };

export function exempleWattecoPulseSenso(canal: "1" | "2" | "3", valeur: number): string {
  const fctrl = FCTRL_PAR_CANAL[canal];
  return fctrl.toString(16).padStart(2, "0") + "0a" + "000f" + "0402" + "23" + u32be(valeur);
}

export function exempleMilesightEm300Di(valeur: number): string {
  return "05c8" + u32le(valeur);
}

export function exempleDraginoSw3l(valeur: number, mod: 0 | 1 = 0): string {
  return "04" + u32be(valeur) + mod.toString(16).padStart(2, "0") + "00" + u32be(0);
}

export const EXEMPLE_PAR_DECODEUR: Record<
  string,
  (impulsions: number, canal: string | null) => string
> = {
  adeunis_pulse_v4: (impulsions) => exempleAdeunisPulseV4(impulsions, impulsions),
  watteco_pulse_senso: (impulsions, canal) =>
    exempleWattecoPulseSenso((canal as "1" | "2" | "3") ?? "1", impulsions),
  milesight_em300_di: (impulsions) => exempleMilesightEm300Di(impulsions),
  dragino_sw3l: (impulsions) => exempleDraginoSw3l(impulsions),
};
