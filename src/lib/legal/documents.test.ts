import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DOCUMENTS,
  documentLegal,
  INFORMATIONS_LEGALES,
  MENTION_SURVEILLANCE,
  morceaux,
  nombreACompleter,
  STATUT_DOCUMENTS,
} from "./documents";

const texte = (slug: string) =>
  documentLegal(slug)!
    .sections()
    .flatMap((s) => [s.titre, ...s.paragraphes])
    .join("\n");

describe("pages légales (modèles à faire valider)", () => {
  it("les six documents du plan existent", () => {
    expect(DOCUMENTS.map((d) => d.slug).sort()).toEqual(
      ["cgu", "cgv", "conditions-pilote", "confidentialite", "mentions-legales", "sous-traitance"].sort(),
    );
    expect(documentLegal("inconnu")).toBeNull();
  });

  it("restent des modèles tant que l'entité n'est pas renseignée", () => {
    const entiteRenseignee = Object.values(INFORMATIONS_LEGALES).every(Boolean);
    if (!entiteRenseignee) expect(STATUT_DOCUMENTS).toBe("modele");
    expect(texte("mentions-legales")).toContain("[à compléter : raison sociale de l'exploitant]");
    expect(nombreACompleter()).toBeGreaterThan(10);
  });

  it("CGV : obligation de moyens, aucune garantie de détection, méthode prudente", () => {
    const cgv = texte("cgv");
    expect(cgv).toContain("obligation de moyens et non de résultat");
    expect(cgv).toContain("aucune détection de fuite n'est garantie");
    expect(cgv).toContain(MENTION_SURVEILLANCE);
    expect(cgv).toContain("méthode prudente");
  });

  it("pilote : suite en abonnement seulement avec un accord écrit horodaté, révocable", () => {
    const pilote = texte("conditions-pilote");
    expect(pilote).toContain("uniquement si le client l'a accepté par écrit");
    expect(pilote).toContain("avec son nom, la date et l'heure enregistrées");
    expect(pilote).toContain("peut être retiré à tout moment");
  });

  it("accord de sous-traitance (article 28) et confidentialité : sous-traitants et droits", () => {
    expect(documentLegal("sous-traitance")!.titre).toContain("article 28");
    const confidentialite = texte("confidentialite");
    for (const nom of ["Supabase", "Vercel", "Resend", "Twilio", "Sentry"]) expect(confidentialite).toContain(nom);
    expect(confidentialite).toContain("CNIL");
    expect(confidentialite).toContain("CNDP");
  });

  it("isole les passages à compléter pour les surligner", () => {
    expect(morceaux("Siège : [à compléter : adresse]. Fin.")).toEqual([
      { texte: "Siège : ", aCompleter: false },
      { texte: "[à compléter : adresse]", aCompleter: true },
      { texte: ". Fin.", aCompleter: false },
    ]);
  });

  it("l'inscription et l'accord de pilote renvoient vers les conditions", () => {
    const racine = path.resolve(import.meta.dirname, "../..");
    const inscription = readFileSync(path.join(racine, "components/auth/FormulaireInscription.tsx"), "utf8");
    expect(inscription).toContain('href="/legal/cgu"');
    expect(inscription).toContain('href="/legal/confidentialite"');
    const pilote = readFileSync(path.join(racine, "components/sites/ConsentementPilote.tsx"), "utf8");
    expect(pilote).toContain('href="/legal/conditions-pilote"');
  });
});
