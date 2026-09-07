import { describe, it, expect } from "vitest";
import { parseEmailMailgun, verifierSignatureMailgun } from "./mailgun";

function estErreur(v: unknown): v is { erreur: string } {
  return typeof v === "object" && v !== null && "erreur" in v;
}

describe("parseEmailMailgun", () => {
  it("extrait recipient/sender/subject et les pièces jointes numérotées", async () => {
    const form = new FormData();
    form.set("recipient", "ab12cd34@import.smartmeteria.fr");
    form.set("sender", "regie@example.com");
    form.set("subject", "Export du jour");
    form.set("attachment-count", "1");
    form.set(
      "attachment-1",
      new File(["a,b\n1,2"], "export.csv", { type: "text/csv" }),
    );

    const res = await parseEmailMailgun(form);
    expect(estErreur(res)).toBe(false);
    if (estErreur(res)) return;
    expect(res.token).toBe("ab12cd34");
    expect(res.expediteur).toBe("regie@example.com");
    expect(res.piecesJointes).toHaveLength(1);
    expect(new TextDecoder().decode(res.piecesJointes[0].contenu)).toBe("a,b\n1,2");
  });

  it("signale une erreur si recipient manquant", async () => {
    const form = new FormData();
    form.set("subject", "sans destinataire");
    const res = await parseEmailMailgun(form);
    expect(estErreur(res)).toBe(true);
  });
});

describe("verifierSignatureMailgun", () => {
  it("valide une signature HMAC-SHA256 correcte et rejette une incorrecte", async () => {
    const cleWebhook = "test-signing-key";
    const timestamp = "1699999999";
    const token = "a".repeat(50);

    const enc = new TextEncoder();
    const cle = await crypto.subtle.importKey(
      "raw",
      enc.encode(cleWebhook),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", cle, enc.encode(timestamp + token));
    const signatureAttendue = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    expect(await verifierSignatureMailgun(timestamp, token, signatureAttendue, cleWebhook)).toBe(
      true,
    );
    expect(await verifierSignatureMailgun(timestamp, token, "0".repeat(64), cleWebhook)).toBe(
      false,
    );
  });
});
