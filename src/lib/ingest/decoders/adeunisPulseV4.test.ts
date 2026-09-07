import { describe, it, expect } from "vitest";
import { decodeAdeunisPulseV4 } from "./adeunisPulseV4";
import { hexToBytes } from "../bytes";

const CONTEXTE = { recuLe: "2026-09-07T10:00:00.000Z" };

describe("decodeAdeunisPulseV4", () => {
  it("décode l'exemple officiel du manuel (frame code 0x46, sans horodatage embarqué)", () => {
    const trame = hexToBytes("46 20 00015C4F 0000F74A");
    const decode = decodeAdeunisPulseV4(trame, CONTEXTE);

    expect(decode.points).toEqual([
      {
        horodatage: CONTEXTE.recuLe,
        canal: "A",
        nature: "index",
        impulsions: 89167,
      },
      {
        horodatage: CONTEXTE.recuLe,
        canal: "B",
        nature: "index",
        impulsions: 63306,
      },
    ]);
    expect(decode.brut).toMatchObject({ frameCounter: 1, batterieFaible: false });
  });

  it("décode l'horodatage embarqué (epoch 2013) quand le bit status correspondant est posé", () => {
    // status = 0x24 -> bit2 (horodatage) posé. 3600s après le 2013-01-01T00:00:00Z.
    const trame = hexToBytes("46 24 00000001 00000002 00000E10");
    const decode = decodeAdeunisPulseV4(trame, CONTEXTE);

    expect(decode.points[0].horodatage).toBe("2013-01-01T01:00:00.000Z");
    expect(decode.points[0].impulsions).toBe(1);
    expect(decode.points[1].impulsions).toBe(2);
  });

  it("rejette un frame code non supporté", () => {
    const trame = hexToBytes("47 00 00000000 00000000");
    expect(() => decodeAdeunisPulseV4(trame, CONTEXTE)).toThrow(/non supporté/);
  });

  it("rejette une trame trop courte", () => {
    expect(() => decodeAdeunisPulseV4(hexToBytes("4620"), CONTEXTE)).toThrow(
      /trop courte/,
    );
  });
});
