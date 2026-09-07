import { describe, it, expect } from "vitest";
import {
  exempleAdeunisPulseV4,
  exempleWattecoPulseSenso,
  exempleMilesightEm300Di,
  exempleDraginoSw3l,
} from "./exemples";
import { hexToBytes } from "./bytes";
import { decodeAdeunisPulseV4 } from "./decoders/adeunisPulseV4";
import { decodeWattecoPulseSenso } from "./decoders/wattecoPulseSenso";
import { decodeMilesightEm300Di } from "./decoders/milesightEm300Di";
import { decodeDraginoSw3l } from "./decoders/draginoSw3l";

const CONTEXTE = { recuLe: "2026-09-07T10:00:00.000Z" };

describe("exemples de trames (aller-retour avec les décodeurs)", () => {
  it("Adeunis PULSE V4", () => {
    const trame = hexToBytes(exempleAdeunisPulseV4(1234, 5678));
    const decode = decodeAdeunisPulseV4(trame, CONTEXTE);
    expect(decode.points[0].impulsions).toBe(1234);
    expect(decode.points[1].impulsions).toBe(5678);
  });

  it("Watteco Pulse Sens'O", () => {
    const trame = hexToBytes(exempleWattecoPulseSenso("2", 42));
    const decode = decodeWattecoPulseSenso(trame, CONTEXTE);
    expect(decode.points[0]).toMatchObject({ canal: "2", impulsions: 42 });
  });

  it("Milesight EM300-DI", () => {
    const trame = hexToBytes(exempleMilesightEm300Di(999));
    const decode = decodeMilesightEm300Di(trame, CONTEXTE);
    expect(decode.points[0].impulsions).toBe(999);
  });

  it("Dragino SW3L", () => {
    const trame = hexToBytes(exempleDraginoSw3l(4321));
    const decode = decodeDraginoSw3l(trame, CONTEXTE);
    expect(decode.points[0].impulsions).toBe(4321);
    expect(decode.points[0].nature).toBe("index");
  });
});
