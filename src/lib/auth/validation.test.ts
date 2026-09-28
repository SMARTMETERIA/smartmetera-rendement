import { describe, expect, it } from "vitest";
import {
  emailValide,
  erreurMotDePasse,
  normaliserTelephone,
  sirenValide,
  validerInscription,
} from "./validation";

const saisie = {
  raisonSociale: "Hôtel du Port",
  nom: "Camille Martin",
  email: "  Direction@Hotel-Port.fr ",
  pays: "FR",
  telephone: "06 12 34 56 78",
  siren: "",
  motDePasse: "un-long-mot-de-passe",
  confirmation: "un-long-mot-de-passe",
};

describe("validation de l'inscription", () => {
  it("accepte une inscription française et normalise l'adresse", () => {
    const r = validerInscription(saisie);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.donnees.email).toBe("direction@hotel-port.fr");
      expect(r.donnees.pays).toBe("FR");
      expect(r.donnees.telephone).toBe("0612345678");
      expect(r.donnees.siren).toBeNull();
    }
  });

  it("accepte un établissement marocain et ignore le SIREN", () => {
    const r = validerInscription({
      ...saisie,
      pays: "MA",
      telephone: "+212 6 61 23 45 67",
      siren: "123",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.donnees.pays).toBe("MA");
      expect(r.donnees.telephone).toBe("0661234567");
      expect(r.donnees.siren).toBeNull();
    }
  });

  it("refuse un numéro marocain pour la France, et l'inverse", () => {
    const fr = validerInscription({ ...saisie, telephone: "+212661234567" });
    expect(fr.ok).toBe(false);
    const ma = validerInscription({
      ...saisie,
      pays: "MA",
      telephone: "0145678901",
    });
    expect(ma.ok).toBe(false);
    if (!ma.ok) expect(ma.erreurs.telephone).toMatch(/marocain/);
  });

  it("signale chaque champ fautif", () => {
    const r = validerInscription({
      raisonSociale: "H",
      nom: "",
      email: "pas-une-adresse",
      pays: "BE",
      telephone: "12",
      siren: "123456789",
      motDePasse: "court",
      confirmation: "court",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.erreurs).sort()).toEqual(
        [
          "email",
          "motDePasse",
          "nom",
          "pays",
          "raisonSociale",
          "siren",
          "telephone",
        ].sort(),
      );
    }
  });

  it("refuse deux mots de passe différents", () => {
    const r = validerInscription({
      ...saisie,
      confirmation: "autre-mot-de-passe",
    });
    expect(r.ok).toBe(false);
  });
});

describe("règles de base", () => {
  it("valide les adresses e-mail", () => {
    expect(emailValide("a@b.fr")).toBe(true);
    expect(emailValide("a@b")).toBe(false);
  });

  it("borne la longueur du mot de passe", () => {
    expect(erreurMotDePasse("123456789")).not.toBeNull();
    expect(erreurMotDePasse("1234567890")).toBeNull();
    expect(erreurMotDePasse("x".repeat(73))).not.toBeNull();
  });

  it("normalise les numéros français et marocains", () => {
    expect(normaliserTelephone("+33 6 12 34 56 78")).toBe("0612345678");
    expect(normaliserTelephone("0033612345678")).toBe("0612345678");
    expect(normaliserTelephone("05.22.12.34.56", "MA")).toBe("0522123456");
    expect(normaliserTelephone("00212 7 00 11 22 33", "MA")).toBe("0700112233");
    expect(normaliserTelephone("0312345678", "MA")).toBeNull();
  });

  it("contrôle la clé du SIREN", () => {
    expect(sirenValide("732829320")).toBe(true);
    expect(sirenValide("732829321")).toBe(false);
  });
});
