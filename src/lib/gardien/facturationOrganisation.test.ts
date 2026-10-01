import { describe, expect, it } from "vitest";
import { validerFacturation } from "./facturationOrganisation";

const base = { statut: "actif", finEssai: "", remisePct: "", retenuePct: "", prixPartenaire: "" };

describe("facturation d'une organisation (superadmin)", () => {
  it("valeurs par défaut : aucune remise, aucune retenue, tarif standard", () => {
    expect(validerFacturation(base)).toEqual({
      ok: true,
      valeurs: { status: "actif", trial_ends_at: null, founder_discount_pct: 0, withholding_tax_pct: 0, partner_price_per_point: null },
    });
  });

  it("accepte la virgule française et arrondit au centime", () => {
    const r = validerFacturation({ ...base, remisePct: "12,5", retenuePct: "10", prixPartenaire: "7,499" });
    expect(r).toMatchObject({ ok: true, valeurs: { founder_discount_pct: 12.5, withholding_tax_pct: 10, partner_price_per_point: 7.5 } });
  });

  it("refuse un statut inconnu, un pourcentage hors bornes ou un prix illisible", () => {
    expect(validerFacturation({ ...base, statut: "gratuit" })).toEqual({ ok: false, erreur: "Choisissez un statut." });
    expect(validerFacturation({ ...base, remisePct: "120" })).toMatchObject({ ok: false, erreur: expect.stringContaining("Remise fondateur") });
    expect(validerFacturation({ ...base, retenuePct: "-3" })).toMatchObject({ ok: false, erreur: expect.stringContaining("Retenue") });
    expect(validerFacturation({ ...base, prixPartenaire: "sept" })).toMatchObject({ ok: false });
  });

  it("essai : fin le jour choisi à 23 h 59, heure locale (été, hiver, Maroc)", () => {
    expect(validerFacturation({ ...base, statut: "essai" })).toEqual({ ok: false, erreur: "Indiquez la date de fin d'essai." });
    const ete = validerFacturation({ ...base, statut: "essai", finEssai: "2026-10-15" });
    expect(ete).toMatchObject({ ok: true, valeurs: { trial_ends_at: "2026-10-15T21:59:00.000Z" } });
    const hiver = validerFacturation({ ...base, statut: "essai", finEssai: "2026-12-15" });
    expect(hiver).toMatchObject({ ok: true, valeurs: { trial_ends_at: "2026-12-15T22:59:00.000Z" } });
    const maroc = validerFacturation({ ...base, statut: "essai", finEssai: "2026-12-15" }, "Africa/Casablanca");
    expect(maroc.ok && new Date(maroc.valeurs.trial_ends_at as string).getUTCDate()).toBe(15);
  });
});
