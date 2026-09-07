// Point d'entrée des 2 routes de notification par e-mail, déclenchées par
// pg_cron via pg_net (voir supabase/migrations/0016_alertes_notifications.sql) :
//   /notifications/alertes — toutes les 15 min, envoie un e-mail groupé par
//     organisation pour les alertes pas encore notifiées (alerts.notifie_le
//     is null), à admin_client + agent.
//   /notifications/digest — lundi 7h Europe/Paris (gating DST-safe côté
//     SQL), un digest hebdomadaire par organisation (rendement glissant 12
//     mois + alertes de la semaine), à admin_client + agent + lecteur.
// verify_jwt reste activé : le déclencheur pg_cron s'authentifie avec la
// clé publique "anon" (un JWT valide, mais sans aucun privilège — la
// fonction utilise ensuite service_role en interne pour son propre travail,
// pas la clé qui a servi à l'invoquer).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { construireEmailAlertes, type AlerteResume } from "./lib/alerteEmail.ts";
import { construireEmailDigest, type StatsBilanDigest } from "./lib/digestEmail.ts";
import type { EmailRendu } from "./lib/emailLayout.ts";

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

async function envoyerEmail(destinataires: string[], rendu: EmailRendu) {
  const reponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFrom,
      to: destinataires,
      subject: rendu.subject,
      html: rendu.html,
      text: rendu.text,
    }),
  });
  if (!reponse.ok) {
    throw new Error(`Resend a répondu ${reponse.status} : ${await reponse.text()}`);
  }
}

async function resoudreDestinataires(
  admin: SupabaseClient,
  organizationId: string,
  roles: string[],
): Promise<string[]> {
  const { data: memberships } = await admin
    .from("memberships")
    .select("user_id")
    .eq("organization_id", organizationId)
    .in("role", roles);

  const emails = new Set<string>();
  for (const m of memberships ?? []) {
    const { data } = await admin.auth.admin.getUserById(m.user_id);
    if (data.user?.email) emails.add(data.user.email);
  }
  return [...emails];
}

// deno-lint-ignore no-explicit-any
function nomSecteur(a: any): string | null {
  return (a.sectors as { nom: string } | null)?.nom ?? null;
}

async function traiterAlertes(admin: SupabaseClient) {
  const { data: alertes } = await admin
    .from("alerts")
    .select("id, organization_id, type, severite, titre, description, declenchee_le, sectors(nom)")
    .is("notifie_le", null)
    .eq("statut", "ouverte")
    .order("declenchee_le");

  if (!alertes || alertes.length === 0) return { organisations: 0, alertes: 0 };

  const parOrg = new Map<string, typeof alertes>();
  for (const a of alertes) {
    const liste = parOrg.get(a.organization_id) ?? [];
    liste.push(a);
    parOrg.set(a.organization_id, liste);
  }

  let nbOrganisations = 0;
  for (const [organizationId, alertesOrg] of parOrg) {
    const { data: org } = await admin
      .from("organizations")
      .select("nom")
      .eq("id", organizationId)
      .single();

    const destinataires = await resoudreDestinataires(admin, organizationId, [
      "admin_client",
      "agent",
    ]);

    if (destinataires.length > 0) {
      const resume: AlerteResume[] = alertesOrg.map((a) => ({
        type: a.type,
        severite: a.severite,
        titre: a.titre,
        description: a.description,
        secteurNom: nomSecteur(a),
        declencheeLe: a.declenchee_le,
      }));
      const rendu = construireEmailAlertes(org?.nom ?? "Organisation", resume, siteUrl);
      try {
        await envoyerEmail(destinataires, rendu);
      } catch {
        continue; // pas marqué notifié : retenté au prochain passage (15 min)
      }
    }

    await admin
      .from("alerts")
      .update({ notifie_le: new Date().toISOString() })
      .in(
        "id",
        alertesOrg.map((a) => a.id),
      );
    nbOrganisations += 1;
  }

  return { organisations: nbOrganisations, alertes: alertes.length };
}

function dateDuJourEuropeParis(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

async function traiterDigest(admin: SupabaseClient) {
  const { data: orgs } = await admin.from("organizations").select("id, nom");
  const semaineDebut = dateDuJourEuropeParis();
  const depuis = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  let envoyes = 0;
  for (const org of orgs ?? []) {
    const { data: dejaEnvoye } = await admin
      .from("digest_hebdo_envois")
      .select("id")
      .eq("organization_id", org.id)
      .eq("semaine_debut", semaineDebut)
      .maybeSingle();
    if (dejaEnvoye) continue;

    const { data: bilan } = await admin
      .from("bilans_calcules")
      .select("rendement, ilp, ilc, conforme_decret, periode_fin")
      .eq("organization_id", org.id)
      .eq("type_periode", "glissant_12m")
      .order("periode_fin", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: alertesSemaine } = await admin
      .from("alerts")
      .select("type, severite, titre, description, declenchee_le, sectors(nom)")
      .eq("organization_id", org.id)
      .gte("declenchee_le", depuis)
      .order("declenchee_le", { ascending: false });

    const { count: nbOuvertes } = await admin
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("statut", "ouverte");

    const destinataires = await resoudreDestinataires(admin, org.id, [
      "admin_client",
      "agent",
      "lecteur",
    ]);

    if (destinataires.length > 0) {
      const stats: StatsBilanDigest | null = bilan
        ? {
            rendement: bilan.rendement,
            ilp: bilan.ilp,
            ilc: bilan.ilc,
            conformeDecret: bilan.conforme_decret,
            periodeFin: bilan.periode_fin,
          }
        : null;
      const resume: AlerteResume[] = (alertesSemaine ?? []).map((a) => ({
        type: a.type,
        severite: a.severite,
        titre: a.titre,
        description: a.description,
        secteurNom: nomSecteur(a),
        declencheeLe: a.declenchee_le,
      }));
      const rendu = construireEmailDigest(org.nom, stats, resume, nbOuvertes ?? 0, siteUrl);
      try {
        await envoyerEmail(destinataires, rendu);
      } catch {
        continue; // pas enregistré comme envoyé : retenté dans la fenêtre du jour
      }
    }

    await admin
      .from("digest_hebdo_envois")
      .insert({ organization_id: org.id, semaine_debut: semaineDebut });
    envoyes += 1;
  }

  return { organisations: orgs?.length ?? 0, envoyes };
}

Deno.serve(async (req: Request) => {
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  const idx = segments.indexOf("notifications");
  const route = idx !== -1 ? segments[idx + 1] : undefined;

  if (req.method !== "POST") {
    return json({ erreur: "Méthode non autorisée, POST attendu" }, 405);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  if (route === "alertes") {
    const resultat = await traiterAlertes(admin);
    return json({ ok: true, ...resultat });
  }
  if (route === "digest") {
    const resultat = await traiterDigest(admin);
    return json({ ok: true, ...resultat });
  }
  return json({ erreur: "Route inconnue, attendu /notifications/alertes ou /notifications/digest" }, 404);
});
