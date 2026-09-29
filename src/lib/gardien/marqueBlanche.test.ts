import { describe, expect, it } from "vitest";
import {
  COULEURS_NEUTRES,
  CONTRASTE_MINIMUM,
  MARQUE_PLATEFORME,
  couleurLisible,
  couleurTexteSur,
  marqueDepuisBranding,
  rapportContraste,
  variablesTheme,
} from "@/lib/marque";
import { avisContraste, validerMarque } from "./marqueSaisie";
import { usageMensuel } from "./usage";

const lisible = (c: string) => rapportContraste(c, couleurTexteSur(c));

describe("thème à la marque", () => {
  it("une couleur déjà lisible est gardée telle quelle", () => {
    expect(couleurLisible("#1B4F8A")).toBe("#1B4F8A");
    expect(couleurLisible("#2A9D8F")).toBe("#2A9D8F");
  });

  it("une couleur trop claire est foncée jusqu'à 4,5:1", () => {
    for (const c of ["#7F7F7F", "#3AA0FF", "#E07B00", "#FF3366"]) {
      const appliquee = couleurLisible(c);
      expect(lisible(appliquee)).toBeGreaterThanOrEqual(CONTRASTE_MINIMUM);
    }
    expect(couleurLisible("rouge")).toBe(MARQUE_PLATEFORME.couleur);
  });

  it("variables CSS du thème : couleur principale et texte lisible dessus", () => {
    const vars = variablesTheme({ ...MARQUE_PLATEFORME, couleur: "#1B4F8A" });
    expect(vars["--primary"]).toBe("#1B4F8A");
    expect(vars["--primary-foreground"]).toBe(COULEURS_NEUTRES.blanc);
    expect(vars["--chart-1"]).toBe("#1B4F8A");
  });

  it("marque d'un partenaire : expéditeur, accent, couleur rendue lisible", () => {
    const m = marqueDepuisBranding("Camping Services SAS", {
      display_name: "Camping Pro",
      primary_color: "#7F7F7F",
      accent_color: "#F2A900",
      logo_path: "https://exemple.fr/logo.png",
      legal_footer: null,
      show_powered_by: true,
      reply_to_email: "contact@campingpro.fr",
      sender_name: "Alertes Camping Pro",
    });
    expect(m).toMatchObject({ nom: "Camping Pro", expediteur: "Alertes Camping Pro", accent: "#F2A900" });
    expect(lisible(m.couleur)).toBeGreaterThanOrEqual(CONTRASTE_MINIMUM);
    expect(marqueDepuisBranding("Hôtel", null).expediteur).toBe("Hôtel");
  });
});

describe("saisie de la marque", () => {
  const base = { nomAffiche: "Camping Pro", couleur: "#2a9d8f", accent: "", logo: null, expediteur: "", repondreA: "", piedDePage: "" };

  it("normalise et borne", () => {
    const v = validerMarque({ ...base, piedDePage: "  SARL Camping Pro, RCS Agde  " });
    expect(v).toMatchObject({ ok: true, ligne: { primary_color: "#2A9D8F", accent_color: null, legal_footer: "SARL Camping Pro, RCS Agde" } });
  });

  it("refuse une couleur, un logo ou une adresse invalides", () => {
    expect(validerMarque({ ...base, couleur: "vert" }).ok).toBe(false);
    expect(validerMarque({ ...base, logo: "http://exemple.fr/l.png" }).ok).toBe(false);
    expect(validerMarque({ ...base, repondreA: "pas-une-adresse" }).ok).toBe(false);
    expect(validerMarque({ ...base, expediteur: 'Pro <x@y.fr>' }).ok).toBe(false);
  });

  it("avis de contraste affiché à l'administrateur", () => {
    expect(avisContraste("#1B4F8A")).toMatchObject({ ok: true });
    expect(avisContraste("#F2A900").ok).toBe(true);
    const clair = avisContraste("#7F7F7F");
    expect(clair.ok).toBe(false);
    expect(lisible(clair.appliquee)).toBeGreaterThanOrEqual(CONTRASTE_MINIMUM);
  });
});

describe("prix partenaire dans l'usage mensuel", () => {
  const tarifs = { EUR: { mise_en_service_point: 349, abonnement_premier_point: 19, abonnement_point_supplementaire: 12 } };
  const site = (monnaie: "EUR" | "MAD") => ({
    id: "s",
    nom: "Camping",
    monnaie,
    surcharges: null,
    avecPasserelle: false,
    poses: ["2026-08-01T00:00:00Z", "2026-08-01T00:00:00Z", "2026-08-01T00:00:00Z"],
    sondes: 0,
    pilote: false,
  });

  it("3 points à 7 € au lieu des abonnements publics", () => {
    const [u] = usageMensuel({ debutMois: "2026-09-01", finMois: "2026-10-01", tarifs, sites: [site("EUR")], remiseFondateurPct: 0, retenuePct: 0, prixPartenaireParPoint: 7 });
    expect(u.ht).toBe(21);
    expect(u.lignes).toEqual([{ libelle: "Camping : prix partenaire, point", quantite: 3, prixUnitaire: 7, montant: 21 }]);
  });

  it("au Maroc, prix partenaire à paramétrer", () => {
    const [u] = usageMensuel({ debutMois: "2026-09-01", finMois: "2026-10-01", tarifs, sites: [site("MAD")], remiseFondateurPct: 0, retenuePct: 0, prixPartenaireParPoint: 7 });
    expect(u.incomplet).toBe(true);
  });
});
