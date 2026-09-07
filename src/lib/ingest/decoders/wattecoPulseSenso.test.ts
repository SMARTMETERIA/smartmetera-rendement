import { describe, it, expect } from "vitest";
import { decodeWattecoPulseSenso } from "./wattecoPulseSenso";
import { hexToBytes } from "../bytes";

const CONTEXTE = { recuLe: "2026-09-07T10:00:00.000Z" };

describe("decodeWattecoPulseSenso", () => {
  it("décode l'exemple officiel (Input2, cluster Binary Input, valeur=1)", () => {
    const trame = hexToBytes("31 0a 000f 0402 23 00000001");
    const decode = decodeWattecoPulseSenso(trame, CONTEXTE);

    expect(decode.points).toEqual([
      {
        horodatage: CONTEXTE.recuLe,
        canal: "2",
        nature: "index",
        impulsions: 1,
      },
    ]);
  });

  it("décode Input1 (Fctrl 0x11) et Input3 (Fctrl 0x51)", () => {
    const input1 = decodeWattecoPulseSenso(
      hexToBytes("11 0a 000f 0402 23 00000064"),
      CONTEXTE,
    );
    expect(input1.points[0].canal).toBe("1");
    expect(input1.points[0].impulsions).toBe(100);

    const input3 = decodeWattecoPulseSenso(
      hexToBytes("51 0a 000f 0402 23 000000C8"),
      CONTEXTE,
    );
    expect(input3.points[0].canal).toBe("3");
    expect(input3.points[0].impulsions).toBe(200);
  });

  it("signale une trame batch (bit0 = 0) comme non supportée", () => {
    const trame = hexToBytes("30 0a 000f 0402 23 00000001");
    expect(() => decodeWattecoPulseSenso(trame, CONTEXTE)).toThrow(/batch/);
  });

  it("rejette un attribut qui n'est pas le compteur d'impulsions", () => {
    const trame = hexToBytes("31 0a 0000 0000 20 00000001");
    expect(() => decodeWattecoPulseSenso(trame, CONTEXTE)).toThrow(
      /non reconnu/,
    );
  });
});
