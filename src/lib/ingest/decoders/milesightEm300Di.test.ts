import { describe, it, expect } from "vitest";
import { decodeMilesightEm300Di } from "./milesightEm300Di";
import { hexToBytes } from "../bytes";

const CONTEXTE = { recuLe: "2026-09-07T10:00:00.000Z" };

describe("decodeMilesightEm300Di", () => {
  it("décode le canal batterie (0x01/0x75) puis le compteur d'impulsions (0x05/0xC8, uint32 LE)", () => {
    // batterie 92% (0x5c), puis pulse = 256 (0x00000100 en LE : 00 01 00 00)
    const trame = hexToBytes("0175 5c 05c8 00010000");
    const decode = decodeMilesightEm300Di(trame, CONTEXTE);

    expect(decode.points).toEqual([
      { horodatage: CONTEXTE.recuLe, canal: null, nature: "index", impulsions: 256 },
    ]);
    expect(decode.brut).toEqual({ batterie: 0x5c });
  });

  it("décode une trame ne contenant que le compteur d'impulsions", () => {
    const trame = hexToBytes("05c8 0f270000"); // 0x0000270f = 9999
    const decode = decodeMilesightEm300Di(trame, CONTEXTE);
    expect(decode.points[0].impulsions).toBe(9999);
  });

  it("lève une erreur si aucun canal de comptage n'est présent", () => {
    const trame = hexToBytes("0175 5c");
    expect(() => decodeMilesightEm300Di(trame, CONTEXTE)).toThrow(
      /Aucun canal/,
    );
  });
});
