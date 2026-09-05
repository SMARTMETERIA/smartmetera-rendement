import { describe, expect, it } from "vitest";
import { computeDeltasForMeter } from "./computeDeltas";

function point(rowNumber: number, ts: string, indexM3: number) {
  return { rowNumber, ts: new Date(ts), indexM3 };
}

describe("computeDeltasForMeter", () => {
  it("ignore le premier relevé (aucun delta calculable)", () => {
    const { readings, ignored } = computeDeltasForMeter(
      [point(1, "2026-01-01T00:00:00Z", 100)],
      undefined,
    );
    expect(readings).toHaveLength(0);
    expect(ignored).toHaveLength(1);
    expect(ignored[0].reason).toMatch(/Premier relevé/);
  });

  it("calcule un delta positif normal", () => {
    const { readings } = computeDeltasForMeter(
      [
        point(1, "2026-01-01T00:00:00Z", 100),
        point(2, "2026-01-01T01:00:00Z", 112.5),
      ],
      undefined,
    );
    expect(readings).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        volumeM3: 12.5,
        qualityFlag: "valide",
      }),
    ]);
  });

  it("corrige un rollover plausible (repasse par zéro)", () => {
    const maxValueM3 = 100_000; // ex. registre 8 chiffres en litres, converti en m3
    const { readings } = computeDeltasForMeter(
      [
        point(1, "2026-01-01T00:00:00Z", 99_999.9),
        point(2, "2026-01-01T01:00:00Z", 0.5),
      ],
      maxValueM3,
    );
    expect(readings[0].qualityFlag).toBe("corrigee");
    expect(readings[0].volumeM3).toBeCloseTo(0.6, 5);
  });

  it("flag suspecte un delta négatif trop grand pour être un rollover (remplacement de compteur)", () => {
    const maxValueM3 = 100_000;
    const { readings } = computeDeltasForMeter(
      [
        point(1, "2026-01-01T00:00:00Z", 50_000), // en milieu de plage : un rollover donnerait un delta énorme, implausible
        point(2, "2026-01-01T01:00:00Z", 10),
      ],
      maxValueM3,
    );
    expect(readings[0].qualityFlag).toBe("suspecte");
    expect(readings[0].volumeM3).toBe(0);
  });

  it("flag suspecte un delta négatif quand rollover_digits n'est pas configuré", () => {
    const { readings } = computeDeltasForMeter(
      [
        point(1, "2026-01-01T00:00:00Z", 100),
        point(2, "2026-01-01T01:00:00Z", 80),
      ],
      undefined,
    );
    expect(readings[0].qualityFlag).toBe("suspecte");
  });

  it("trie les points par date avant de calculer les deltas, quel que soit l'ordre d'entrée", () => {
    const { readings } = computeDeltasForMeter(
      [
        point(2, "2026-01-01T01:00:00Z", 112.5),
        point(1, "2026-01-01T00:00:00Z", 100),
      ],
      undefined,
    );
    expect(readings).toHaveLength(1);
    expect(readings[0].volumeM3).toBe(12.5);
  });
});
