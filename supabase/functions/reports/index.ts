// Génération de rapports PDF (pdf-lib) :
//   /reports/mensuel — déclenché par pg_cron/pg_net le 1er du mois vers
//     06:00 Europe/Paris (gating DST-safe côté SQL, voir
//     supabase/migrations/0020_rapport_mensuel_cron.sql). Pour chaque
//     organisation ayant au moins un destinataire actif
//     (rapport_destinataires), génère le rapport du mois précédent, le
//     stocke dans le bucket "rapports", l'enregistre dans `reports`, et
//     l'envoie par e-mail (Resend, PDF en pièce jointe).
//   /reports/plan-action — à la demande (bouton "Export PDF" de
//     /plan-actions), body { actionPlanId }. Génère un PDF du plan, le
//     stocke et l'enregistre dans `reports`, renvoie l'id du rapport (le
//     client récupère l'URL signée lui-même via Supabase Storage).
// verify_jwt reste activé : la clé publique "anon" suffit à authentifier
// l'appel pg_cron (aucun privilège associé), le reste du travail utilise
// service_role en interne.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { genererRapportMensuelPdf } from "./lib/rapportMensuelPdf.ts";
import { genererPlanActionsPdf } from "./lib/planActionsPdf.ts";
import { assemblerContenuRapportMensuel, type LigneNightline } from "./lib/assemblerContenu.ts";
import type { PlanActionsRapport } from "./lib/types.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
const resendFrom = Deno.env.get("RESEND_FROM_EMAIL")!;
const siteUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function envoyerEmailAvecPdf(
  destinataires: string[],
  sujet: string,
  html: string,
  text: string,
  nomFichier: string,
  pdf: Uint8Array,
) {
  const reponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: resendFrom,
      to: destinataires,
      subject: sujet,
      html,
      text,
      attachments: [{ filename: nomFichier, content: bytesToBase64(pdf) }],
    }),
  });
  if (!reponse.ok) {
    throw new Error(`Resend a répondu ${reponse.status} : ${await reponse.text()}`);
  }
}

function moisPrecedentEuropeParis(): { mois: number; annee: number; debut: Date; fin: Date } {
  const auj = new Date(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date()),
  );
  const premierJourMoisCourant = new Date(Date.UTC(auj.getUTCFullYear(), auj.getUTCMonth(), 1));
  const debut = new Date(
    Date.UTC(premierJourMoisCourant.getUTCFullYear(), premierJourMoisCourant.getUTCMonth() - 1, 1),
  );
  const fin = premierJourMoisCourant;
  return { mois: debut.getUTCMonth() + 1, annee: debut.getUTCFullYear(), debut, fin };
}

async function chargerContenuMensuel(
  admin: SupabaseClient,
  organizationId: string,
  mois: number,
  annee: number,
  debut: Date,
  fin: Date,
) {
  const [{ data: org }, { data: bilan }, { data: secteurs }, { data: nightlines }, { data: alertes }, { data: interventions }, { data: planActif }] =
    await Promise.all([
      admin
        .from("organizations")
        .select("nom, lineaire_reseau_km, nb_abonnes, zone_repartition_eaux")
        .eq("id", organizationId)
        .single(),
      admin
        .from("bilans_calcules")
        .select("periode_debut, periode_fin, rendement, seuil_reglementaire, distance_seuil, conforme_decret, ilp, ilc, v_produit, v_importe, v_exporte, v_comptabilise, v_sans_comptage, v_service, v_mise_en_distribution, v_consomme_autorise, pertes")
        .eq("organization_id", organizationId)
        .eq("type_periode", "glissant_12m")
        .order("periode_fin", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("sectors")
        .select("id, nom, nb_abonnes, lineaire_km")
        .eq("organization_id", organizationId)
        .eq("actif", true)
        .order("nom"),
      admin
        .from("nightlines")
        .select("sector_id, debit_min_nocturne_m3h, baseline_m3h, volume_fuite_estime_m3j, nuit_date")
        .eq("organization_id", organizationId)
        .order("nuit_date", { ascending: false })
        .limit(500),
      admin
        .from("alerts")
        .select("titre, type, severite, declenchee_le, sectors(nom)")
        .eq("organization_id", organizationId)
        .gte("declenchee_le", debut.toISOString())
        .lt("declenchee_le", fin.toISOString())
        .order("declenchee_le"),
      admin
        .from("interventions")
        .select("type, statut, planifiee_le, terminee_le, created_at, volume_recupere_m3j, resultat, sectors(nom)")
        .eq("organization_id", organizationId)
        .gte("created_at", debut.toISOString())
        .lt("created_at", fin.toISOString())
        .order("created_at"),
      admin
        .from("action_plans")
        .select("id, nom, annee_debut, annee_fin")
        .eq("organization_id", organizationId)
        .eq("statut", "actif")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const dernieresNightlines = new Map<string, LigneNightline>();
  for (const n of nightlines ?? []) {
    if (!dernieresNightlines.has(n.sector_id)) dernieresNightlines.set(n.sector_id, n);
  }
  const secteursIdParNom = new Map((secteurs ?? []).map((s) => [s.nom, s.id]));

  let planActions: {
    nom: string;
    annee_debut: number | null;
    annee_fin: number | null;
    actions: { titre: string; categorie: string | null; statut: string; priorite: string; echeance: string | null }[];
  } | null = null;

  if (planActif) {
    const { data: actions } = await admin
      .from("actions")
      .select("titre, statut, priorite, echeance, catalogue_actions_types(categorie)")
      .eq("action_plan_id", planActif.id)
      .order("echeance", { nullsFirst: false });
    planActions = {
      nom: planActif.nom,
      annee_debut: planActif.annee_debut,
      annee_fin: planActif.annee_fin,
      actions: (actions ?? []).map((a) => ({
        titre: a.titre,
        // deno-lint-ignore no-explicit-any
        categorie: ((a.catalogue_actions_types as any)?.categorie as string | null) ?? null,
        statut: a.statut,
        priorite: a.priorite,
        echeance: a.echeance,
      })),
    };
  }

  return assemblerContenuRapportMensuel({
    organisationNom: org?.nom ?? "Organisation",
    lineaireReseauKm: org?.lineaire_reseau_km ?? null,
    nbAbonnes: org?.nb_abonnes ?? null,
    zoneRepartitionEaux: org?.zone_repartition_eaux ?? false,
    mois,
    annee,
    genereLe: new Date().toISOString(),
    bilan: bilan ?? null,
    secteurs: secteurs ?? [],
    dernieresNightlines,
    secteursIdParNom,
    // deno-lint-ignore no-explicit-any
    alertes: (alertes ?? []).map((a: any) => ({
      titre: a.titre,
      type: a.type,
      severite: a.severite,
      declenchee_le: a.declenchee_le,
      sector_nom: a.sectors?.nom ?? null,
    })),
    // deno-lint-ignore no-explicit-any
    interventions: (interventions ?? []).map((i: any) => ({
      type: i.type,
      statut: i.statut,
      sector_nom: i.sectors?.nom ?? null,
      date: i.terminee_le ?? i.planifiee_le ?? i.created_at,
      volume_recupere_m3j: i.volume_recupere_m3j,
      resultat: i.resultat,
    })),
    planActions,
  });
}

async function traiterRapportMensuel(admin: SupabaseClient) {
  const { mois, annee, debut, fin } = moisPrecedentEuropeParis();

  const { data: orgsAvecDestinataires } = await admin
    .from("rapport_destinataires")
    .select("organization_id, email")
    .eq("actif", true);

  const parOrg = new Map<string, string[]>();
  for (const d of orgsAvecDestinataires ?? []) {
    const liste = parOrg.get(d.organization_id) ?? [];
    liste.push(d.email);
    parOrg.set(d.organization_id, liste);
  }

  let envoyes = 0;
  for (const [organizationId, destinataires] of parOrg) {
    const { data: dejaGenere } = await admin
      .from("reports")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("type", "rapport_mensuel")
      .eq("annee", annee)
      .eq("mois", mois)
      .maybeSingle();
    if (dejaGenere) continue;

    const contenu = await chargerContenuMensuel(admin, organizationId, mois, annee, debut, fin);
    const pdf = await genererRapportMensuelPdf(contenu);

    const { data: reportRow, error: reportError } = await admin
      .from("reports")
      .insert({
        organization_id: organizationId,
        type: "rapport_mensuel",
        annee,
        mois,
        statut: "genere",
      })
      .select("id")
      .single();
    if (reportError || !reportRow) continue;

    const filePath = `${organizationId}/${reportRow.id}.pdf`;
    await admin.storage
      .from("rapports")
      .upload(filePath, new Blob([pdf], { type: "application/pdf" }), {
        contentType: "application/pdf",
      });
    await admin.from("reports").update({ fichier_path: filePath }).eq("id", reportRow.id);

    const nomFichier = `rapport-${contenu.annee}-${String(contenu.mois).padStart(2, "0")}.pdf`;
    const sujet = `[SmartMeteria] Rapport mensuel — ${contenu.organisationNom}`;
    const html = `<p>Bonjour,</p><p>Le rapport mensuel de <strong>${contenu.organisationNom}</strong> est joint à cet e-mail.</p><p><a href="${siteUrl}">Ouvrir SmartMeteria</a></p>`;
    const text = `Rapport mensuel de ${contenu.organisationNom} joint à cet e-mail.\n${siteUrl}`;

    try {
      await envoyerEmailAvecPdf(destinataires, sujet, html, text, nomFichier, pdf);
      envoyes += 1;
    } catch {
      // le rapport reste enregistré (consultable dans l'app) même si l'envoi échoue
    }
  }

  return { organisations: parOrg.size, envoyes };
}

async function traiterPlanAction(admin: SupabaseClient, actionPlanId: string) {
  const { data: plan } = await admin
    .from("action_plans")
    .select("id, organization_id, nom, annee_debut, annee_fin")
    .eq("id", actionPlanId)
    .single();
  if (!plan) return { erreur: "Plan d'actions introuvable" };

  const { data: org } = await admin
    .from("organizations")
    .select("nom")
    .eq("id", plan.organization_id)
    .single();

  const { data: actions } = await admin
    .from("actions")
    .select("titre, statut, priorite, echeance, catalogue_actions_types(categorie)")
    .eq("action_plan_id", plan.id)
    .order("echeance", { nullsFirst: false });

  const planRapport: PlanActionsRapport = {
    nom: plan.nom,
    anneeDebut: plan.annee_debut,
    anneeFin: plan.annee_fin,
    actions: (actions ?? []).map((a) => ({
      titre: a.titre,
      // deno-lint-ignore no-explicit-any
      categorie: ((a.catalogue_actions_types as any)?.categorie as string | null) ?? null,
      statut: a.statut,
      priorite: a.priorite,
      echeance: a.echeance,
    })),
  };

  const genereLe = new Date().toISOString();
  const pdf = await genererPlanActionsPdf({
    organisationNom: org?.nom ?? "Organisation",
    plan: planRapport,
    genereLe,
  });

  const { data: reportRow, error: reportError } = await admin
    .from("reports")
    .insert({ organization_id: plan.organization_id, type: "plan_action", statut: "genere" })
    .select("id")
    .single();
  if (reportError || !reportRow) return { erreur: reportError?.message ?? "Création du rapport impossible" };

  const filePath = `${plan.organization_id}/${reportRow.id}.pdf`;
  const { error: uploadError } = await admin.storage
    .from("rapports")
    .upload(filePath, new Blob([pdf], { type: "application/pdf" }), {
      contentType: "application/pdf",
    });
  if (uploadError) return { erreur: uploadError.message };

  await admin.from("reports").update({ fichier_path: filePath }).eq("id", reportRow.id);

  return { reportId: reportRow.id, filePath };
}

Deno.serve(async (req: Request) => {
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  const idx = segments.indexOf("reports");
  const route = idx !== -1 ? segments[idx + 1] : undefined;

  if (req.method !== "POST") {
    return json({ erreur: "Méthode non autorisée, POST attendu" }, 405);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  if (route === "mensuel") {
    const resultat = await traiterRapportMensuel(admin);
    return json({ ok: true, ...resultat });
  }

  if (route === "plan-action") {
    let body: { actionPlanId?: string };
    try {
      body = await req.json();
    } catch {
      return json({ erreur: "Corps de requête JSON invalide" }, 400);
    }
    if (!body.actionPlanId) return json({ erreur: "actionPlanId manquant" }, 400);
    const resultat = await traiterPlanAction(admin, body.actionPlanId);
    if ("erreur" in resultat) return json({ ok: false, ...resultat }, 500);
    return json({ ok: true, ...resultat });
  }

  return json(
    { erreur: "Route inconnue, attendu /reports/mensuel ou /reports/plan-action" },
    404,
  );
});
