import { describe, it, expect } from "vitest";
import { parseEmailPostmark } from "./postmark";

function estErreur(v: unknown): v is { erreur: string } {
  return typeof v === "object" && v !== null && "erreur" in v;
}

describe("parseEmailPostmark", () => {
  it("extrait le jeton depuis MailboxHash (adressage natif Postmark)", () => {
    const res = parseEmailPostmark({
      From: "regie@example.com",
      To: "abc123+ab12cd34@inbound.postmarkapp.com",
      MailboxHash: "ab12cd34",
      Subject: "Export du jour",
      Attachments: [
        { Name: "export.csv", Content: Buffer.from("a,b\n1,2").toString("base64"), ContentType: "text/csv" },
      ],
    });
    expect(estErreur(res)).toBe(false);
    if (estErreur(res)) return;
    expect(res.token).toBe("ab12cd34");
    expect(res.expediteur).toBe("regie@example.com");
    expect(res.piecesJointes).toHaveLength(1);
    expect(res.piecesJointes[0].nomFichier).toBe("export.csv");
    expect(new TextDecoder().decode(res.piecesJointes[0].contenu)).toBe("a,b\n1,2");
  });

  it("retombe sur le parsing de l'adresse si MailboxHash absent (domaine dédié)", () => {
    const res = parseEmailPostmark({
      From: "regie@example.com",
      To: "ab12cd34@import.smartmeteria.fr",
      Subject: "Export",
      Attachments: [],
    });
    expect(estErreur(res)).toBe(false);
    if (estErreur(res)) return;
    expect(res.token).toBe("ab12cd34");
  });

  it("signale une erreur si To/OriginalRecipient manquant", () => {
    const res = parseEmailPostmark({ From: "a@b.com" });
    expect(estErreur(res)).toBe(true);
  });
});
