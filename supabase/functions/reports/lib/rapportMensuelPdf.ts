import { ConstructeurPdf } from "./pdfBuilder.ts";
import { LABEL_CATEGORIE_ACTION, LABEL_TYPE_ALERTE, LABEL_TYPE_INTERVENTION, MOIS_FR } from "./labels.ts";
import type { ContenuRapportMensuel } from "./types.ts";

function pct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(1)} %`;
}

// N'utilise pas Intl.NumberFormat("fr-FR") : son separateur de milliers
// (espace fine insecable, U+202F) n'est pas codable par la police WinAnsi
// standard de pdf-lib (voir pdfBuilder.ts) - on construit le groupement
// par 3 chiffres nous-memes avec un espace ASCII normal.
function nb(v: number | null, decimales = 0): string {
  if (v === null) return "—";
  const [entier, dec] = v.toFixed(decimales).split(".");
  const signe = entier.startsWith("-") ? "-" : "";
  const chiffres = signe ? entier.slice(1) : entier;
  const groupe = chiffres.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return dec ? `${signe}${groupe},${dec}` : `${signe}${groupe}`;
}

function dateFr(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR");
}

export async function genererRapportMensuelPdf(c: ContenuRapportMensuel): Promise<Uint8Array> {
  const pdf = await ConstructeurPdf.creer();

  // --- Page de garde ---------------------------------------------------
  pdf.espace(200);
  pdf.texte("Rapport mensuel", { taille: 26, gras: true, centre: true });
  pdf.espace(6);
  pdf.texte(c.organisationNom, { taille: 16, centre: true });
  pdf.espace(10);
  pdf.texte(`${MOIS_FR[c.mois - 1]} ${c.annee}`, { taille: 13, centre: true, muted: true });
  pdf.espace(40);
  pdf.texte(`Généré le ${new Date(c.genereLe).toLocaleDateString("fr-FR")}`, {
    taille: 9,
    centre: true,
    muted: true,
  });
  pdf.texte("SmartMeteria — bilan d'eau, rendement de réseau, sectorisation", {
    taille: 9,
    centre: true,
    muted: true,
  });

  // --- Bilan et rendement ------------------------------------------------
  pdf.nouvellePage();
  pdf.titreSection("Bilan et rendement de réseau");
  if (c.bilan) {
    pdf.texte(
      `Période glissante : ${dateFr(c.bilan.periodeDebut)} au ${dateFr(c.bilan.periodeFin)}`,
      { taille: 9, muted: true },
    );
    pdf.espace(4);
    pdf.cle("Rendement du réseau (P104.3)", pct(c.bilan.rendement));
    pdf.cle("Seuil réglementaire (décret 2012-97)", pct(c.bilan.seuilReglementaire));
    pdf.cle("Conformité", c.bilan.conformeDecret ? "Conforme" : "Non conforme");
    pdf.cle("Indice linéaire de pertes — ILP (P106.3)", `${nb(c.bilan.ilp, 3)} m³/km/j`);
    pdf.cle("Indice linéaire de consommation — ILC", `${nb(c.bilan.ilc, 3)} m³/km/j`);
    pdf.espace(6);
    pdf.tableau(
      ["Composante", "Volume (m³)"],
      [280, 150],
      [
        ["Volume produit", nb(c.bilan.vProduit)],
        ["Volume importé", nb(c.bilan.vImporte)],
        ["Volume exporté", nb(c.bilan.vExporte)],
        ["Volume mis en distribution (Vmd)", nb(c.bilan.vMiseEnDistribution)],
        ["Volume comptabilisé", nb(c.bilan.vComptabilise)],
        ["Volume consommé sans comptage", nb(c.bilan.vSansComptage)],
        ["Volume de service", nb(c.bilan.vService)],
        ["Volume consommé autorisé (Vca)", nb(c.bilan.vConsommeAutorise)],
        ["Pertes (Vmd - Vca)", nb(c.bilan.pertes)],
      ],
    );
  } else {
    pdf.texte("Bilan pas encore calculé pour cette organisation.", { muted: true });
  }

  // --- Secteurs ------------------------------------------------------------
  pdf.titreSection("Secteurs");
  pdf.tableau(
    ["Secteur", "Abonnés", "Linéaire (km)", "DMN (m³/h)", "Baseline (m³/h)", "Fuite estimée (m³/j)"],
    [140, 60, 75, 75, 85, 95],
    c.secteurs.map((s) => [
      s.nom,
      s.nbAbonnes?.toString() ?? "—",
      nb(s.lineaireKm, 1),
      nb(s.dernierDmnM3h, 2),
      nb(s.derniereBaselineM3h, 2),
      nb(s.derniereFuiteEstimeeM3j, 1),
    ]),
  );

  // --- Alertes du mois -------------------------------------------------
  pdf.titreSection(`Alertes déclenchées en ${MOIS_FR[c.mois - 1].toLowerCase()}`);
  pdf.tableau(
    ["Alerte", "Type", "Sévérité", "Secteur", "Date"],
    [155, 100, 65, 100, 75],
    c.alertes.map((a) => [
      a.titre,
      LABEL_TYPE_ALERTE[a.type] ?? a.type,
      a.severite,
      a.secteurNom ?? "—",
      dateFr(a.declencheeLe),
    ]),
  );

  // --- Interventions et m³ récupérés --------------------------------------
  pdf.titreSection("Interventions et m³ récupérés");
  pdf.cle("Volume total récupéré ce mois", `${nb(c.volumeTotalRecupereM3j, 1)} m³/j`);
  pdf.espace(4);
  pdf.tableau(
    ["Type", "Secteur", "Date", "Statut", "Volume récupéré (m³/j)"],
    [110, 110, 70, 80, 120],
    c.interventions.map((i) => [
      LABEL_TYPE_INTERVENTION[i.type] ?? i.type,
      i.secteurNom ?? "—",
      dateFr(i.date),
      i.statut,
      i.volumeRecupereM3j !== null ? nb(i.volumeRecupereM3j, 1) : "—",
    ]),
  );

  // --- Plan d'actions --------------------------------------------------
  pdf.titreSection("Plan d'actions (décret 2012-97)");
  if (c.planActions) {
    pdf.texte(
      `${c.planActions.nom}${c.planActions.anneeDebut ? ` (${c.planActions.anneeDebut}-${c.planActions.anneeFin ?? ""})` : ""}`,
      { taille: 10, muted: true },
    );
    pdf.espace(4);
    pdf.tableau(
      ["Action", "Catégorie", "Priorité", "Statut", "Échéance"],
      [175, 110, 65, 75, 75],
      c.planActions.actions.map((a) => [
        a.titre,
        a.categorie ? (LABEL_CATEGORIE_ACTION[a.categorie] ?? a.categorie) : "—",
        a.priorite,
        a.statut,
        dateFr(a.echeance),
      ]),
    );
  } else {
    pdf.texte("Aucun plan d'actions actif pour cette organisation.", { muted: true });
  }

  return pdf.octets();
}
