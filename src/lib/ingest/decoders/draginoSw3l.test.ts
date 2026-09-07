import { describe, it, expect } from "vitest";
import { decodeDraginoSw3l } from "./draginoSw3l";
import { hexToBytes } from "../bytes";

const CONTEXTE = { recuLe: "2026-09-07T10:00:00.000Z" };

describe("decodeDraginoSw3l", () => {
  it("décode une trame en mode index cumulatif (MOD=0)", () => {
    // octet0 = 0x04 -> calculate_flag=1, pas d'alarme
    // pulses = 0x00002710 = 10000, MOD = 0x00, timestamp = 1700000000
    const trame = hexToBytes("04 00002710 00 00 6553F100");
    const decode = decodeDraginoSw3l(trame, CONTEXTE);

    expect(decode.points).toEqual([
      {
        horodatage: new Date(0x6553f100 * 1000).toISOString(),
        canal: null,
        nature: "index",
        impulsions: 10000,
      },
    ]);
    expect(decode.brut).toMatchObject({ alarme: false, calculateFlag: 1, mod: 0 });
  });

  it("décode une trame en mode delta (MOD=1) et détecte l'alarme", () => {
    const trame = hexToBytes("02 00000005 01 00 00000000");
    const decode = decodeDraginoSw3l(trame, CONTEXTE);

    expect(decode.points[0].nature).toBe("delta");
    expect(decode.points[0].impulsions).toBe(5);
    // timestamp = 0 -> pas plausible, on retombe sur l'horodatage de réception
    expect(decode.points[0].horodatage).toBe(CONTEXTE.recuLe);
    expect(decode.brut).toMatchObject({ alarme: true });
  });

  it("rejette une trame trop courte", () => {
    expect(() => decodeDraginoSw3l(hexToBytes("0400"), CONTEXTE)).toThrow(
      /trop courte/,
    );
  });
});
