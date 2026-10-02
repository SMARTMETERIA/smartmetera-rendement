import { describe, expect, it } from "vitest";
import { normaliserTelephone as telephoneInscription, paysDe, validerInscription } from "@/lib/auth/validation";
import { REGLAGES_PAYS, fuseauPays, monnaiePays, retenueSourceParDefaut } from "./pays";
import { validerNouveauSite } from "./sites";
import { formaterTelephone, normaliserTelephone } from "./telephone";
import { prediagnostic, validerPrediagnostic } from "./prediagnostic";
import { economiesPrudentes, methodePertes, monnaieDe } from "@/lib/moteur-gardien/economies";
import { montant, montantRond } from "@/lib/gardien-envois/format";
import { canalRelance } from "@/lib/gardien-envois/destinataires";
import { partiesLocales } from "@/lib/moteur-gardien/temps";

const texte = (s: string) => s.replace(/[  ]/g, " ");

describe("République démocratique du Congo", () => {
  it("pays, fuseaux et monnaies proposés", () => {
    expect(REGLAGES_PAYS.CD).toMatchObject({
      fuseau: "Africa/Kinshasa",
      monnaie: "USD",
      fuseaux: ["Africa/Kinshasa", "Africa/Lubumbashi"],
      monnaies: ["USD", "CDF"],
    });
    expect(paysDe("CD")).toBe("CD");
    expect(paysDe("XX")).toBe("FR");
    expect(fuseauPays("CD")).toBe("Africa/Kinshasa");
    expect(monnaiePays("CD")).toBe("USD");
    expect(monnaieDe("CDF")).toBe("CDF");
    expect(monnaieDe("GBP")).toBe("EUR");
  });

  it("heure locale : Kinshasa UTC+1, Lubumbashi UTC+2, sans changement d'heure", () => {
    const hiver = Date.UTC(2026, 0, 15, 0);
    const ete = Date.UTC(2026, 6, 15, 0);
    expect(partiesLocales(hiver, "Africa/Kinshasa").heure).toBe(1);
    expect(partiesLocales(ete, "Africa/Kinshasa").heure).toBe(1);
    expect(partiesLocales(hiver, "Africa/Lubumbashi").heure).toBe(2);
    expect(partiesLocales(ete, "Africa/Lubumbashi").heure).toBe(2);
  });

  it("nouveau site : dollar à Kinshasa par défaut, franc congolais à Lubumbashi au choix", () => {
    const parDefaut = validerNouveauSite({ name: "Hôtel du Fleuve", type: "hotel", pays: "CD", ville: "Kinshasa" });
    expect(parDefaut.ok && parDefaut.site).toMatchObject({ country: "CD", timezone: "Africa/Kinshasa", currency: "USD" });
    const est = validerNouveauSite({ name: "Mine", type: "autre", pays: "CD", fuseau: "Africa/Lubumbashi", monnaie: "CDF" });
    expect(est.ok && est.site).toMatchObject({ timezone: "Africa/Lubumbashi", currency: "CDF" });
    expect(validerNouveauSite({ name: "Hôtel", type: "hotel", pays: "CD", monnaie: "MAD" })).toEqual({
      ok: false,
      erreur: "Choisissez la monnaie du site.",
    });
    expect(validerNouveauSite({ name: "Hôtel", type: "hotel", pays: "FR", fuseau: "Africa/Kinshasa" })).toEqual({
      ok: false,
      erreur: "Choisissez le fuseau horaire du site.",
    });
  });

  it("montants en dollars et en francs congolais, méthode prudente", () => {
    expect(texte(montant(12.5, "USD"))).toBe("12,50 USD");
    expect(texte(montantRond(125000, "CDF"))).toBe("125 000 CDF");
    expect(texte(economiesPrudentes({ excesLph: 25, delaiJours: 30, prixM3: 2, monnaie: "USD" }).methode)).toContain(
      "× 2,00 USD/m³ = 36,00 USD",
    );
    // Aucun prix de l'eau par défaut en RDC : volumes seulement.
    expect(economiesPrudentes({ excesLph: 25, delaiJours: 30, prixM3: null, monnaie: "CDF" }).montant).toBeNull();
    expect(methodePertes(25, null, "USD")).toContain("prix de l'eau du site à renseigner");
  });

  it("téléphones congolais (+243)", () => {
    expect(telephoneInscription("081 234 5678", "CD")).toBe("0812345678");
    expect(telephoneInscription("+243 99 123 4567", "CD")).toBe("0991234567");
    expect(telephoneInscription("00243 81 234 5678", "CD")).toBe("0812345678");
    expect(telephoneInscription("0612345678", "CD")).toBeNull();
    expect(normaliserTelephone("081 234 5678", "CD")).toEqual({ ok: true, numero: "+243812345678" });
    expect(formaterTelephone("+243812345678")).toBe("+243 81 234 5678");
  });

  it("inscription : établissement en RDC, sans SIREN, retenue à la source non inventée", () => {
    const r = validerInscription({
      raisonSociale: "Hôtel du Fleuve",
      nom: "Aimé Kabila",
      email: "contact@exemple.cd",
      pays: "CD",
      telephone: "+243 81 234 5678",
      siren: "123456789",
      motDePasse: "motdepasse-solide",
      confirmation: "motdepasse-solide",
    });
    expect(r.ok && r.donnees).toMatchObject({ pays: "CD", telephone: "0812345678", siren: null });
    expect(validerInscription({ pays: "CD", telephone: "0612345678" }).ok).toBe(false);
    // Aucun réglage : 0 % (TODO(RAYAN)) ; un réglage en dollars est repris.
    expect(retenueSourceParDefaut({ USD: { retenue_source_pct_defaut: null } }, "CD")).toBe(0);
    expect(retenueSourceParDefaut({ USD: { retenue_source_pct_defaut: 14 } }, "CD")).toBe(14);
  });

  it("relance d'une fuite par WhatsApp, comme au Maroc", () => {
    expect(canalRelance("CD")).toBe("whatsapp");
    expect(canalRelance("FR")).toBe("appel");
  });

  it("pré-diagnostic en dollars ou en francs congolais, sans tarif inventé", () => {
    const v = validerPrediagnostic({ etablissement: "Hôtel du Fleuve", pays: "CD", monnaie: "CDF", prixM3: "3500", nbPoints: "2" });
    expect(v.ok && v.entree).toMatchObject({ pays: "CD", monnaie: "CDF" });
    const repli = validerPrediagnostic({ etablissement: "Hôtel", pays: "CD", monnaie: "MAD", prixM3: "2" });
    expect(repli.ok && repli.entree.monnaie).toBe("USD");
    if (!v.ok) throw new Error("validation");
    const r = prediagnostic(v.entree, { abonnement_premier_point: null }, { chasseLph: 25, fuiteEnterreeLph: 500 });
    expect(r.monnaie).toBe("CDF");
    expect(r.service).toBeNull();
    expect(texte(r.phrase)).toContain("CDF par an");
  });
});
