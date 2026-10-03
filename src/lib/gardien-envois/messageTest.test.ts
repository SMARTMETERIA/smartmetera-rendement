import { describe, expect, it, vi } from "vitest";
import { MARQUE_PLATEFORME } from "../marque";
import { configEnvois, notify } from "./notify";
import { libelleResultat, messagesTest, validerMessageTest } from "./messageTest";
import { quantite } from "./format";

describe("message de test du superadmin", () => {
  it("valide les canaux, l'adresse et le numéro", () => {
    expect(validerMessageTest({ email: "a@b.fr", canaux: [] })).toEqual({ ok: false, erreur: "Choisissez au moins un canal." });
    expect(validerMessageTest({ email: "", canaux: ["email"] })).toMatchObject({ ok: false });
    expect(validerMessageTest({ email: "a@b.fr", telephone: "06 12 34 56 78", canaux: ["sms"] })).toMatchObject({
      ok: false,
      erreur: expect.stringContaining("+33"),
    });
    expect(
      validerMessageTest({ email: "a@b.fr", telephone: "+33 6 12 34 56 78", canaux: ["email", "sms", "inconnu"] }),
    ).toEqual({ ok: true, demande: { email: "a@b.fr", telephone: "+33612345678", canaux: ["email", "sms"] } });
    expect(validerMessageTest({ email: "a@b.fr", telephone: "n'importe", canaux: ["email"] })).toEqual({
      ok: true,
      demande: { email: "a@b.fr", telephone: null, canaux: ["email"] },
    });
  });

  it("un message par canal, à soi-même, à la marque SmartMeteria", () => {
    const messages = messagesTest(
      MARQUE_PLATEFORME,
      { email: "rayan@exemple.fr", telephone: "+33612345678", canaux: ["email", "sms", "appel"] },
      "https://app.smartmeteria.com",
    );
    expect(messages.map((m) => [m.canal, m.destinataire])).toEqual([
      ["email", "rayan@exemple.fr"],
      ["sms", "+33612345678"],
      ["appel", "+33612345678"],
    ]);
    expect(messages[0].sujet).toBe("Message de test — Gardien de l'eau by SmartMeteria");
    expect(messages[0].texte).toMatch(/Gardien de l'eau by SmartMeteria$/);
    expect(messages[0].expediteur).toBe("SmartMeteria");
    expect(messages[0].repondreA).toBe("contact@smartmeteria.com");
    expect(messages[1].texte).toContain("SmartMeteria : message de test");
    expect(messages[2].texte).toMatch(/^Bonjour, ici SmartMeteria\./);
  });

  it("en développement (mode journal), rien ne part et le résultat le dit", async () => {
    const recuperer = vi.fn();
    const [m] = messagesTest(MARQUE_PLATEFORME, { email: "a@b.fr", telephone: null, canaux: ["email"] }, "http://localhost:3000");
    const r = await notify(m, configEnvois({ RESEND_API_KEY: "k", RESEND_FROM_EMAIL: "a@b.fr" }), recuperer);
    expect(recuperer).not.toHaveBeenCalled();
    expect(libelleResultat({ canal: "email", ...r })).toBe(
      "Rien n'est parti : envois en mode « journal » (normal en développement).",
    );
  });

  it("libellés de résultat compréhensibles", () => {
    expect(libelleResultat({ canal: "sms", mode: "reel", statut: "envoye", fournisseur: "twilio", erreur: null })).toBe(
      "Parti. Vérifiez la réception.",
    );
    expect(
      libelleResultat({ canal: "sms", mode: "redirection", statut: "envoye", fournisseur: "twilio", erreur: null }),
    ).toContain("numéro de test");
    expect(
      libelleResultat({ canal: "sms", mode: "reel", statut: "echec", fournisseur: "twilio", erreur: "Twilio a répondu 401." }),
    ).toBe("Échec : Twilio a répondu 401.");
    expect(
      libelleResultat({ canal: "appel", mode: "journal", statut: "journalise", fournisseur: null, erreur: "Twilio n'est pas configuré pour ce canal." }),
    ).toContain("Twilio n'est pas configuré");
  });
});

describe("accord en nombre", () => {
  it("singulier pour 0 et 1, pluriel au-delà, nombre au format français", () => {
    expect(quantite(0, "anomalie trouvée", "anomalies trouvées")).toBe("0 anomalie trouvée");
    expect(quantite(1, "anomalie trouvée", "anomalies trouvées")).toBe("1 anomalie trouvée");
    expect(quantite(3, "anomalie trouvée", "anomalies trouvées")).toBe("3 anomalies trouvées");
    expect(quantite(1200, "ligne", "lignes").replace(/\s/g, " ")).toBe("1 200 lignes");
  });
});
