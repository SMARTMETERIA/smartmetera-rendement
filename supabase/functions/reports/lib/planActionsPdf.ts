import { ConstructeurPdf } from "./pdfBuilder.ts";
import { LABEL_CATEGORIE_ACTION } from "./labels.ts";
import type { PlanActionsRapport } from "./types.ts";

function dateFr(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR");
}

export async function genererPlanActionsPdf(params: {
  organisationNom: string;
  plan: PlanActionsRapport;
  genereLe: string;
}): Promise<Uint8Array> {
  const pdf = await ConstructeurPdf.creer();

  pdf.espace(120);
  pdf.texte("Plan d'actions — décret 2012-97", { taille: 22, gras: true, centre: true });
  pdf.espace(6);
  pdf.texte(params.organisationNom, { taille: 15, centre: true });
  pdf.espace(8);
  pdf.texte(params.plan.nom, { taille: 12, centre: true, muted: true });
  if (params.plan.anneeDebut) {
    pdf.texte(`${params.plan.anneeDebut} — ${params.plan.anneeFin ?? ""}`, {
      taille: 11,
      centre: true,
      muted: true,
    });
  }
  pdf.espace(30);
  pdf.texte(`Généré le ${new Date(params.genereLe).toLocaleDateString("fr-FR")}`, {
    taille: 9,
    centre: true,
    muted: true,
  });

  pdf.nouvellePage();
  pdf.titreSection("Actions du plan");
  pdf.tableau(
    ["Action", "Catégorie", "Priorité", "Statut", "Échéance"],
    [175, 110, 65, 75, 75],
    params.plan.actions.map((a) => [
      a.titre,
      a.categorie ? (LABEL_CATEGORIE_ACTION[a.categorie] ?? a.categorie) : "—",
      a.priorite,
      a.statut,
      dateFr(a.echeance),
    ]),
  );

  return pdf.octets();
}
