import { describe, expect, it } from "vitest";
import { formaterMontant, formaterVolume, totalEconomies } from "./fuites";

const texte = (s: string) => s.replace(/[  ]/g, " ");

describe("fuites : affichage", () => {
  it("montants et volumes au format français", () => {
    expect(texte(formaterMontant(1070.91, "EUR"))).toBe("1 070,91 €");
    expect(texte(formaterMontant(207, "MAD"))).toBe("207,00 MAD");
    expect(texte(formaterVolume(0.6))).toBe("0,6 m³");
  });

  it("additionne les économies par monnaie, sans inventer de montant", () => {
    expect(
      totalEconomies([
        { saved_m3: "18.000", saved_amount: "81.00", currency: "EUR" },
        { saved_m3: 12, saved_amount: 58.68, currency: "EUR" },
        { saved_m3: 18, saved_amount: null, currency: "MAD" },
      ]),
    ).toEqual([
      { monnaie: "EUR", m3: 30, montant: 139.68 },
      { monnaie: "MAD", m3: 18, montant: null },
    ]);
  });
});
