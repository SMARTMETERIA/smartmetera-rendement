import { describe, expect, it } from "vitest";
import { porteeInvitation } from "./invitations";
import { validerNouveauSite } from "./sites";
import { retenueSourceParDefaut } from "./pays";

describe("invitations", () => {
  it("limite toujours un directeur à un site", () => {
    expect(porteeInvitation("directeur_site", "s1")).toEqual({
      ok: true,
      role: "directeur_site",
      portee: { scopeType: "site", siteId: "s1" },
    });
    expect(porteeInvitation("directeur_site", null)).toEqual({
      ok: false,
      erreur: "Choisissez le site de ce directeur.",
    });
  });

  it("donne au technicien un site ou tous les sites", () => {
    expect(porteeInvitation("technicien", "s2")).toMatchObject({
      portee: { scopeType: "site", siteId: "s2" },
    });
    expect(porteeInvitation("technicien", "  ")).toMatchObject({
      portee: { scopeType: "organisation", siteId: null },
    });
  });

  it("ignore le site pour les rôles d'organisation", () => {
    expect(porteeInvitation("agent", "s1")).toMatchObject({
      role: "agent",
      portee: { scopeType: "organisation", siteId: null },
    });
  });

  it("refuse les rôles inconnus ou réservés", () => {
    expect(porteeInvitation("superadmin", null)).toMatchObject({ ok: false });
    expect(porteeInvitation("gestionnaire", null)).toMatchObject({ ok: false });
  });
});

describe("nouveau site", () => {
  it("déduit le fuseau, la monnaie et l'unité d'activité", () => {
    expect(
      validerNouveauSite({
        name: " Riad Atlas ",
        type: "hotel",
        pays: "MA",
        ville: "Marrakech",
      }),
    ).toEqual({
      ok: true,
      site: {
        name: "Riad Atlas",
        type: "hotel",
        country: "MA",
        timezone: "Africa/Casablanca",
        currency: "MAD",
        city: "Marrakech",
        activity_unit: "nuitee",
      },
    });
    const camping = validerNouveauSite({
      name: "Les Pins",
      type: "camping",
      pays: "FR",
    });
    expect(camping).toMatchObject({
      ok: true,
      site: {
        timezone: "Europe/Paris",
        currency: "EUR",
        activity_unit: "emplacement",
        city: null,
      },
    });
  });

  it("refuse un nom vide, un type ou un pays inconnu", () => {
    expect(validerNouveauSite({ name: "", type: "hotel", pays: "FR" }).ok).toBe(
      false,
    );
    expect(
      validerNouveauSite({ name: "Spa", type: "spa", pays: "FR" }).ok,
    ).toBe(false);
    expect(
      validerNouveauSite({ name: "Spa", type: "hotel", pays: "ES" }).ok,
    ).toBe(false);
  });
});

describe("retenue à la source par défaut", () => {
  const tarifs = {
    EUR: { retenue_source_pct_defaut: 0 },
    MAD: { retenue_source_pct_defaut: 10 },
  };

  it("lit les réglages de plateforme", () => {
    expect(retenueSourceParDefaut(tarifs, "FR")).toBe(0);
    expect(retenueSourceParDefaut(tarifs, "MA")).toBe(10);
    expect(
      retenueSourceParDefaut(
        { MAD: { retenue_source_pct_defaut: 12.5 } },
        "MA",
      ),
    ).toBe(12.5);
  });

  it("retombe sur 0 % en France et 10 % au Maroc si les réglages manquent", () => {
    expect(retenueSourceParDefaut(null, "FR")).toBe(0);
    expect(retenueSourceParDefaut(undefined, "MA")).toBe(10);
    expect(
      retenueSourceParDefaut({ MAD: { retenue_source_pct_defaut: "x" } }, "MA"),
    ).toBe(10);
  });
});
