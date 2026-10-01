// Envois du Gardien de l'eau (phase G5), déclenchés toutes les 15 minutes
// par pg_cron via pg_net (voir supabase/migrations/0043_gardien_envois.sql).
//
// 1. Fuites : SMS et e-mail au technicien, appel (France) ou WhatsApp
//    (Maroc) après 2 h sans prise en charge, escalade au directeur après
//    12 h (délais : platform_settings.alertes).
// 2. Alertes : capteur muet (au partenaire ou à SmartMeteria, jamais au
//    client en premier), température basse, rappel des analyses.
// 3. Première donnée reçue après une pose : au technicien qui a posé.
// 4. Rapports à 8 h (heure du site) : première nuit, première semaine,
//    mensuel (le 1er), synthèse de groupe.
// 5. Pilotes : résumé et page preuve à J+25, conversion (seulement avec
//    consentement écrit) ou tâche d'appel à J+30, tâche de remboursement.
// 6. Tâche « rapports non ouverts depuis 2 mois ».
// 7. Récapitulatif quotidien au superadmin (7 h, heure de Paris, phase G10).
//
// Chaque message passe par notify() et laisse une ligne dans le journal
// des envois (ajout seul, unique par destinataire) : rien n'est envoyé
// deux fois. Mode « journal » par défaut (GARDIEN_ENVOIS_MODE) : en
// développement, rien ne part réellement.
//
// verify_jwt reste activé : pg_cron s'authentifie avec la clé « anon ».
// Corps facultatif, pris en compte seulement pour un appel service_role :
// {"maintenant": "ISO", "organization_id": "...", "sections": ["fuites",
// "alertes", "poses", "rapports", "pilotes", "suivi"]} ou
// {"page_preuve": "<site_id>"} (création d'une page preuve à la demande).
// ou {"message_test": {"email", "telephone", "canaux"}} (message de test du
// superadmin, phase G10).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { MARQUE_PLATEFORME, marqueDepuisBranding, type LigneMarque, type Marque } from "./lib/marque.ts";
import { configEnvois, notify, type Canal, type ConfigEnvois } from "./lib/gardien-envois/notify.ts";
import {
  canalRelance,
  clientDuSite,
  directeursDuSite,
  equipeDuSite,
  equipeOrganisation,
  etapesDues,
  responsablesAlerte,
  type Membre,
} from "./lib/gardien-envois/destinataires.ts";
import {
  messageCapteurMuet,
  messageConversion,
  messageFinPilote,
  messageFuite,
  messageGroupe,
  messagePremiereDonnee,
  messageRapport,
  messageRappelAnalyses,
  messageTemperature,
  type Rendu,
} from "./lib/gardien-envois/messages.ts";
import { montant } from "./lib/gardien-envois/format.ts";
import { lignesSurveillance, messageRecapitulatif, type EtatTaches } from "./lib/gardien-envois/surveillance.ts";
import { messagesTest, validerMessageTest, type ResultatTest } from "./lib/gardien-envois/messageTest.ts";
import {
  contenuFinPilote,
  contenuMensuel,
  contenuPagePreuve,
  contenuPremiereNuit,
  contenuPremiereSemaine,
  coutService,
  resumeRapport,
  type FuiteSource,
  type LigneTemperatureRapport,
  type SiteRapport,
  type Tarifs,
  type TypeRapport,
} from "./lib/gardien-rapports/contenus.ts";
import { debitsHoraires, type Releve } from "./lib/moteur-gardien/debits.ts";
import { indicateurActivite } from "./lib/moteur-gardien/activite.ts";
import {
  lireReglagesTemperature,
  registreMensuel,
  seuilPoint,
  type ReglagesTemperature,
  type TypePoint,
} from "./lib/moteur-gardien/temperatures.ts";
import type { StatutFuite, TypeFuite } from "./lib/moteur-gardien/analyse.ts";
import type { Monnaie } from "./lib/moteur-gardien/economies.ts";
import {
  HEURE_MS,
  JOUR_MS,
  dateLocale,
  decalerJour,
  instantLocal,
  partiesLocales,
} from "./lib/moteur-gardien/temps.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const urlApp = (Deno.env.get("GARDIEN_URL_APP") ?? Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000").replace(/\/$/, "");

/** Au-delà, un événement ancien n'est plus notifié (reprise après arrêt). */
const FRAICHEUR_MS = 48 * HEURE_MS;
const HEURE_RAPPORTS = 8;
const HEURE_RECAPITULATIF = 7;
const SECTIONS = ["fuites", "alertes", "poses", "rapports", "pilotes", "suivi", "recapitulatif"] as const;
type Section = (typeof SECTIONS)[number];

type Ligne = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Rôle du jeton (signature déjà vérifiée par verify_jwt). */
function roleAppelant(req: Request): string | null {
  const jeton = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const charge = jeton.split(".")[1];
  if (!charge) return null;
  try {
    const base64 = charge.replace(/-/g, "+").replace(/_/g, "/");
    const contenu = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    return typeof contenu.role === "string" ? contenu.role : null;
  } catch {
    return null;
  }
}

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (v: unknown) => (typeof v === "string" ? Date.parse(v) : null);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

async function lire<T = Ligne[]>(
  promesse: PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await promesse;
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

interface Organisation {
  id: string;
  nom: string;
  status: string;
  founder_discount_pct: number | null;
}

interface Site {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  city: string | null;
  country: string;
  timezone: string;
  currency: Monnaie;
  water_price_per_m3: number | null;
  activity_unit: string;
  capacity: number | null;
  occupancy_rate_default: number | null;
  price_overrides: Ligne | null;
}

interface Contexte {
  admin: SupabaseClient;
  maintenantMs: number;
  /** Passage de toute la plateforme (ni organisation ni instant imposés). */
  plateforme: boolean;
  config: ConfigEnvois;
  reglages: Record<string, Ligne>;
  reglagesTemperature: ReglagesTemperature;
  organisations: Map<string, Organisation>;
  sites: Map<string, Site>;
  membres: Map<string, Membre[]>;
  emails: Map<string, string | null>;
  marques: Map<string, Marque>;
  superadmins: Membre[] | null;
  /** Litres par unité des sites comparables, par (type, pays, unité, mois). */
  comparables: Map<string, Map<string, number>>;
  bilan: Record<string, number>;
  erreurs: string[];
}

function compter(ctx: Contexte, cle: string, n = 1) {
  ctx.bilan[cle] = (ctx.bilan[cle] ?? 0) + n;
}

async function emailUtilisateur(ctx: Contexte, userId: string): Promise<string | null> {
  if (ctx.emails.has(userId)) return ctx.emails.get(userId) ?? null;
  const { data } = await ctx.admin.auth.admin.getUserById(userId);
  const email = data?.user?.email ?? null;
  ctx.emails.set(userId, email);
  return email;
}

async function membresOrganisation(ctx: Contexte, orgId: string): Promise<Membre[]> {
  const connus = ctx.membres.get(orgId);
  if (connus) return connus;
  const lignes = await lire(
    ctx.admin
      .from("memberships")
      .select("user_id, role, scope_type, site_id, alert_phone")
      .eq("organization_id", orgId)
      .in("scope_type", ["organisation", "site"]),
  );
  const membres: Membre[] = [];
  for (const l of lignes) {
    membres.push({
      userId: l.user_id as string,
      email: await emailUtilisateur(ctx, l.user_id as string),
      telephone: (l.alert_phone as string | null) ?? null,
      role: l.role as string,
      portee: l.scope_type === "site" ? "site" : "organisation",
      siteId: (l.site_id as string | null) ?? null,
    });
  }
  ctx.membres.set(orgId, membres);
  return membres;
}

async function superadmins(ctx: Contexte): Promise<Membre[]> {
  if (ctx.superadmins) return ctx.superadmins;
  const lignes = await lire(ctx.admin.from("platform_admins").select("user_id"));
  const liste: Membre[] = [];
  for (const l of lignes) {
    liste.push({
      userId: l.user_id as string,
      email: await emailUtilisateur(ctx, l.user_id as string),
      telephone: null,
      role: "superadmin",
      portee: "organisation",
      siteId: null,
    });
  }
  ctx.superadmins = liste;
  return liste;
}

async function marqueOrganisation(ctx: Contexte, orgId: string): Promise<Marque> {
  const connue = ctx.marques.get(orgId);
  if (connue) return connue;
  const org = ctx.organisations.get(orgId);
  const { data } = await ctx.admin
    .from("org_branding")
    .select("display_name, primary_color, accent_color, logo_path, legal_footer, show_powered_by, reply_to_email, sender_name")
    .eq("organization_id", orgId)
    .maybeSingle();
  const marque = data ? marqueDepuisBranding(org?.nom ?? "", data as LigneMarque) : MARQUE_PLATEFORME;
  ctx.marques.set(orgId, marque);
  return marque;
}

interface Envoi {
  organizationId: string;
  siteId: string | null;
  objet: "fuite" | "alerte" | "rapport" | "pilote" | "pose" | "groupe";
  objetId: string;
  etape: string;
}

/** Un message, un destinataire, un canal : une seule fois. */
async function envoyer(
  ctx: Contexte,
  e: Envoi,
  canal: Canal,
  destinataire: string,
  userId: string | null,
  rendu: Rendu,
  marque: Marque,
): Promise<boolean> {
  const { count } = await ctx.admin
    .from("envois")
    .select("id", { count: "exact", head: true })
    .eq("objet", e.objet)
    .eq("objet_id", e.objetId)
    .eq("etape", e.etape)
    .eq("canal", canal)
    .eq("destinataire", destinataire);
  if (count) return false;
  const texte = canal === "email" ? rendu.texte : canal === "appel" ? rendu.vocal : rendu.court;
  const resultat = await notify(
    {
      canal,
      destinataire,
      sujet: canal === "email" ? rendu.sujet : null,
      texte,
      html: canal === "email" ? rendu.html : null,
      expediteur: marque.expediteur,
      repondreA: marque.repondreA,
    },
    ctx.config,
  );
  const { error } = await ctx.admin.from("envois").insert({
    organization_id: e.organizationId,
    site_id: e.siteId,
    objet: e.objet,
    objet_id: e.objetId,
    etape: e.etape,
    canal,
    destinataire,
    user_id: userId,
    sujet: canal === "email" ? rendu.sujet : null,
    corps: texte,
    mode: resultat.mode,
    statut: resultat.statut,
    fournisseur: resultat.fournisseur,
    fournisseur_id: resultat.fournisseurId,
    erreur: resultat.erreur,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
  if (!error) compter(ctx, `envois_${canal}`);
  return !error;
}

/** E-mail et SMS (si un numéro est connu) à chaque membre. */
async function prevenir(
  ctx: Contexte,
  e: Envoi,
  membres: Membre[],
  rendu: Rendu,
  marque: Marque,
  canaux: ("email" | "sms")[] = ["email", "sms"],
): Promise<number> {
  let n = 0;
  for (const m of membres) {
    if (canaux.includes("email") && m.email && (await envoyer(ctx, e, "email", m.email, m.userId, rendu, marque))) n++;
    if (canaux.includes("sms") && m.telephone && (await envoyer(ctx, e, "sms", m.telephone, m.userId, rendu, marque))) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// 1) Fuites et escalade
// ---------------------------------------------------------------------------
async function sectionFuites(ctx: Contexte) {
  const orgIds = [...ctx.organisations.keys()];
  if (!orgIds.length) return;
  const fuites = await lire(
    ctx.admin
      .from("leak_events")
      .select("id, organization_id, site_id, type, status, started_at, detected_at, excess_flow_lph, details, meters(zone, nom)")
      .in("organization_id", orgIds)
      .eq("status", "ouverte")
      .gt("detected_at", iso(ctx.maintenantMs - FRAICHEUR_MS))
      .lte("detected_at", iso(ctx.maintenantMs)),
  );
  const alertes = (ctx.reglages.alertes ?? {}) as Ligne;
  const appelH = Number(alertes.escalade_appel_h ?? 2);
  const directeurH = Number(alertes.escalade_directeur_h ?? 12);
  for (const f of fuites) {
    const site = ctx.sites.get(f.site_id as string);
    if (!site) continue;
    const compteur = (Array.isArray(f.meters) ? f.meters[0] : f.meters) as Ligne | null;
    const details = (f.details ?? {}) as Ligne;
    const membres = await membresOrganisation(ctx, site.organization_id);
    const marque = await marqueOrganisation(ctx, site.organization_id);
    const detecteeMs = ms(f.detected_at) as number;
    const message = {
      id: f.id as string,
      type: f.type as TypeFuite,
      site: site.name,
      zone: (compteur?.zone as string | null) ?? (compteur?.nom as string | null) ?? null,
      fuseau: site.timezone,
      detecteeMs,
      debutMs: ms(f.started_at),
      excesLph: Number(f.excess_flow_lph),
      prixM3: num(site.water_price_per_m3),
      monnaie: site.currency,
      explication: typeof details.explication === "string" ? details.explication : null,
    };
    const etapes = etapesDues({
      statut: f.status as string,
      detecteeMs,
      maintenantMs: ctx.maintenantMs,
      appelH,
      directeurH,
    });
    for (const etape of etapes) {
      const e: Envoi = {
        organizationId: site.organization_id,
        siteId: site.id,
        objet: "fuite",
        objetId: f.id as string,
        etape,
      };
      const rendu = messageFuite({ marque, urlApp }, message, etape, ctx.maintenantMs);
      if (etape === "initial") {
        compter(ctx, "fuites_prevenues", (await prevenir(ctx, e, responsablesAlerte(membres, site.id), rendu, marque)) ? 1 : 0);
      } else if (etape === "appel") {
        const canal = canalRelance(site.country);
        for (const m of responsablesAlerte(membres, site.id)) {
          if (m.telephone) await envoyer(ctx, e, canal, m.telephone, m.userId, rendu, marque);
        }
      } else {
        await prevenir(ctx, e, directeursDuSite(membres, site.id), rendu, marque);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2) Alertes : capteur muet, température basse, rappel des analyses
// ---------------------------------------------------------------------------
async function sectionAlertes(ctx: Contexte) {
  const orgIds = [...ctx.organisations.keys()];
  if (!orgIds.length) return;
  const alertes = await lire(
    ctx.admin
      .from("alerts")
      .select("id, organization_id, site_id, type, titre, description, donnees, declenchee_le")
      .in("organization_id", orgIds)
      .not("site_id", "is", null)
      .eq("statut", "ouverte")
      .in("type", ["compteur_muet", "temperature_basse", "rappel_analyses"])
      .gt("declenchee_le", iso(ctx.maintenantMs - FRAICHEUR_MS))
      .lte("declenchee_le", iso(ctx.maintenantMs)),
  );
  for (const a of alertes) {
    const site = ctx.sites.get(a.site_id as string);
    if (!site) continue;
    const org = ctx.organisations.get(site.organization_id);
    const membres = await membresOrganisation(ctx, site.organization_id);
    const donnees = (a.donnees ?? {}) as Ligne;
    const e: Envoi = {
      organizationId: site.organization_id,
      siteId: site.id,
      objet: "alerte",
      objetId: a.id as string,
      etape: "initial",
    };
    const texte = { titre: a.titre as string, description: (a.description as string) ?? "", site: site.name };
    if (a.type === "compteur_muet") {
      // Jamais au client en premier : l'équipe du partenaire, ou SmartMeteria.
      const partenaire = donnees.destinataire === "partenaire";
      const marque = partenaire ? await marqueOrganisation(ctx, site.organization_id) : MARQUE_PLATEFORME;
      const destinataires = partenaire ? equipeOrganisation(membres) : await superadmins(ctx);
      const rendu = messageCapteurMuet({ marque, urlApp }, { ...texte, organisation: org?.nom ?? "" });
      await prevenir(ctx, e, destinataires, rendu, marque, ["email"]);
    } else if (a.type === "temperature_basse") {
      const marque = await marqueOrganisation(ctx, site.organization_id);
      await prevenir(ctx, e, equipeDuSite(membres, site.id), messageTemperature({ marque, urlApp }, texte), marque);
    } else {
      const marque = await marqueOrganisation(ctx, site.organization_id);
      await prevenir(ctx, e, directeursDuSite(membres, site.id), messageRappelAnalyses({ marque, urlApp }, texte), marque, ["email"]);
    }
  }
}

// ---------------------------------------------------------------------------
// 3) Première donnée reçue après une pose
// ---------------------------------------------------------------------------
async function sectionPoses(ctx: Contexte) {
  const orgIds = [...ctx.organisations.keys()];
  if (!orgIds.length) return;
  const sessions = await lire(
    ctx.admin
      .from("pose_sessions")
      .select("id, organization_id, site_id, meter_id, temperature_point_id, started_by, started_at, zone")
      .in("organization_id", orgIds)
      .neq("status", "abandonnee")
      .not("started_by", "is", null)
      .gt("started_at", iso(ctx.maintenantMs - 3 * JOUR_MS))
      .lte("started_at", iso(ctx.maintenantMs)),
  );
  for (const s of sessions) {
    const site = ctx.sites.get(s.site_id as string);
    if (!site) continue;
    const table = s.meter_id ? "readings" : "temperature_readings";
    const colonne = s.meter_id ? "meter_id" : "point_id";
    const { data: premiere } = await ctx.admin
      .from(table)
      .select("created_at")
      .eq(colonne, (s.meter_id ?? s.temperature_point_id) as string)
      .gte("created_at", s.started_at as string)
      .lte("created_at", iso(ctx.maintenantMs))
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (!premiere) continue;
    const membres = await membresOrganisation(ctx, site.organization_id);
    const poseur = membres.filter((m) => m.userId === s.started_by).slice(0, 1);
    if (!poseur.length) continue;
    const marque = await marqueOrganisation(ctx, site.organization_id);
    const rendu = messagePremiereDonnee(
      { marque, urlApp },
      {
        site: site.name,
        point: (s.zone as string | null) ?? "Capteur",
        recuMs: ms(premiere.created_at) as number,
        fuseau: site.timezone,
      },
    );
    await prevenir(
      ctx,
      { organizationId: site.organization_id, siteId: site.id, objet: "pose", objetId: s.id as string, etape: "premiere_donnee" },
      poseur,
      rendu,
      marque,
    );
  }
}

// ---------------------------------------------------------------------------
// 4) Rapports
// ---------------------------------------------------------------------------
function siteRapport(site: Site): SiteRapport {
  return {
    id: site.id,
    nom: site.name,
    type: site.type,
    ville: site.city,
    pays: site.country,
    monnaie: site.currency,
    fuseau: site.timezone,
    prixM3: num(site.water_price_per_m3),
    uniteActivite: site.activity_unit,
  };
}

async function fuitesDuSite(ctx: Contexte, siteId: string, depuisMs: number, jusquaMs: number): Promise<FuiteSource[]> {
  const lignes = await lire(
    ctx.admin
      .from("leak_events")
      .select("id, type, status, detected_at, repaired_at, excess_flow_lph, saved_m3, saved_amount, meters(zone, nom)")
      .eq("site_id", siteId)
      .gte("detected_at", iso(depuisMs))
      .lt("detected_at", iso(jusquaMs)),
  );
  return lignes.map((f) => {
    const compteur = (Array.isArray(f.meters) ? f.meters[0] : f.meters) as Ligne | null;
    return {
      id: f.id as string,
      type: f.type as TypeFuite,
      zone: (compteur?.zone as string | null) ?? (compteur?.nom as string | null) ?? null,
      statut: f.status as StatutFuite,
      detecteeMs: ms(f.detected_at) as number,
      repareeMs: ms(f.repaired_at),
      excesLph: Number(f.excess_flow_lph),
      economieM3: num(f.saved_m3),
      economieMontant: num(f.saved_amount),
    };
  });
}

async function joursDuSite(ctx: Contexte, meterIds: string[], debut: string, finExclue: string) {
  if (!meterIds.length) return new Map<string, { volumeM3: number; nuitLph: number | null; complet: boolean }>();
  const lignes = await lire(
    ctx.admin
      .from("meter_days")
      .select("day, volume_m3, night_min_lph")
      .in("meter_id", meterIds)
      .gte("day", debut)
      .lt("day", finExclue)
      .limit(10000),
  );
  const parJour = new Map<string, { volumeM3: number; nuitLph: number | null; complet: boolean }>();
  for (const l of lignes) {
    const j = parJour.get(l.day as string) ?? { volumeM3: 0, nuitLph: 0, complet: true };
    j.volumeM3 = Math.round((j.volumeM3 + Number(l.volume_m3)) * 1000) / 1000;
    if (l.night_min_lph === null) j.complet = false;
    else j.nuitLph = (j.nuitLph ?? 0) + Number(l.night_min_lph);
    parJour.set(l.day as string, j);
  }
  return parJour;
}

async function compteursDuSite(ctx: Contexte, siteId: string) {
  return lire(
    ctx.admin
      .from("meters")
      .select("id, installed_at")
      .eq("site_id", siteId)
      .eq("type", "point_comptage")
      .eq("actif", true),
  );
}

/** Crée le rapport (une seule fois) et l'annonce au client du site. */
async function publierRapport(
  ctx: Contexte,
  site: Site,
  type: TypeRapport,
  periode: string,
  construire: () => Promise<Ligne>,
  destinataires?: Membre[],
): Promise<string | null> {
  let { data: rapport } = await ctx.admin
    .from("site_reports")
    .select("id, content, sent_at")
    .eq("site_id", site.id)
    .eq("kind", type)
    .eq("period", periode)
    .maybeSingle();
  if (!rapport) {
    const contenu = await construire();
    const cree = await ctx.admin
      .from("site_reports")
      .insert({ organization_id: site.organization_id, site_id: site.id, kind: type, period: periode, content: contenu })
      .select("id, content, sent_at")
      .single();
    if (cree.error && cree.error.code !== "23505") throw new Error(cree.error.message);
    if (cree.error) return null;
    rapport = cree.data;
    compter(ctx, `rapports_${type}`);
  }
  if (rapport.sent_at) return rapport.id as string;
  const marque = await marqueOrganisation(ctx, site.organization_id);
  const membres = destinataires ?? clientDuSite(await membresOrganisation(ctx, site.organization_id), site.id);
  const contenu = rapport.content as Parameters<typeof resumeRapport>[0];
  const rendu =
    type === "fin_pilote"
      ? messageFinPilote(
          { marque, urlApp },
          {
            rapportId: rapport.id as string,
            site: site.name,
            titre: (contenu as { titre: string }).titre,
            phrase: resumeRapport(contenu),
            lienPreuve: (contenu as { pagePreuve: { token: string } | null }).pagePreuve
              ? `${urlApp}/preuve/${(contenu as { pagePreuve: { token: string } }).pagePreuve.token}`
              : null,
          },
        )
      : messageRapport(
          { marque, urlApp },
          { rapportId: rapport.id as string, type, site: site.name, periode, resume: resumeRapport(contenu) },
        );
  await prevenir(
    ctx,
    { organizationId: site.organization_id, siteId: site.id, objet: "rapport", objetId: rapport.id as string, etape: "rapport" },
    membres,
    rendu,
    marque,
    ["email"],
  );
  await ctx.admin.from("site_reports").update({ sent_at: iso(ctx.maintenantMs) }).eq("id", rapport.id).is("sent_at", null);
  return rapport.id as string;
}

async function rapportPremiereNuit(ctx: Contexte, site: Site, pose: string, meterIds: string[]) {
  const nuit = decalerJour(pose, 1);
  const debut = instantLocal(pose, 22, site.timezone);
  const fin = instantLocal(nuit, 6, site.timezone);
  const releves = await lire(
    ctx.admin
      .from("readings")
      .select("meter_id, ts, volume_m3")
      .in("meter_id", meterIds)
      .in("quality_flag", ["valide", "corrigee"])
      .gt("ts", iso(debut - 2 * HEURE_MS))
      .lte("ts", iso(fin + HEURE_MS))
      .order("ts")
      .limit(10000),
  );
  const parCompteur = new Map<string, Releve[]>();
  for (const r of releves) {
    const liste = parCompteur.get(r.meter_id as string) ?? [];
    liste.push({ tsMs: ms(r.ts) as number, volumeM3: Number(r.volume_m3) });
    parCompteur.set(r.meter_id as string, liste);
  }
  const debits = [...parCompteur.values()].map((l) => new Map(debitsHoraires(l).map((d) => [d.heureMs, d])));
  const courbe: { heure: string; lph: number | null }[] = [];
  for (let h = debut; h < fin; h += HEURE_MS) {
    const valeurs = debits.map((d) => d.get(h)).filter((d) => d && d.lph !== null && !d.lissee);
    const l = partiesLocales(h, site.timezone);
    courbe.push({
      heure: `${String(l.heure).padStart(2, "0")}:00`,
      lph: valeurs.length ? Math.round(valeurs.reduce((s, d) => s + (d!.lph as number), 0) * 10) / 10 : null,
    });
  }
  const fuites = await fuitesDuSite(ctx, site.id, instantLocal(pose, 0, site.timezone), ctx.maintenantMs);
  return contenuPremiereNuit({ site: siteRapport(site), nuit, courbe, fuites, finMs: ctx.maintenantMs }) as unknown as Ligne;
}

async function rapportPremiereSemaine(ctx: Contexte, site: Site, pose: string, meterIds: string[]) {
  const parJour = await joursDuSite(ctx, meterIds, pose, decalerJour(pose, 7));
  const jours = Array.from({ length: 7 }, (_, i) => {
    const date = decalerJour(pose, i);
    const j = parJour.get(date);
    return { date, volumeM3: j?.volumeM3 ?? 0, nuitLph: j && j.complet ? j.nuitLph : null };
  });
  const fuites = await fuitesDuSite(ctx, site.id, instantLocal(pose, 0, site.timezone), ctx.maintenantMs);
  return contenuPremiereSemaine({ site: siteRapport(site), jours, fuites, finMs: ctx.maintenantMs }) as unknown as Ligne;
}

function moisSuivant(premierJour: string): string {
  const d = new Date(`${premierJour}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}
function moisPrecedent(premierJour: string, n = 1): string {
  const d = new Date(`${premierJour}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

async function volumeSite(ctx: Contexte, meterIds: string[], debut: string, fin: string): Promise<number | null> {
  const jours = await joursDuSite(ctx, meterIds, debut, fin);
  if (!jours.size) return null;
  return Math.round([...jours.values()].reduce((s, j) => s + j.volumeM3, 0) * 1000) / 1000;
}

async function quantiteActivite(ctx: Contexte, siteId: string, premierJour: string, fin: string): Promise<number | null> {
  const lignes = await lire(
    ctx.admin
      .from("activity_data")
      .select("date, period, quantity")
      .eq("site_id", siteId)
      .gte("date", premierJour)
      .lt("date", fin),
  );
  const mensuelle = lignes.find((l) => l.period === "mois");
  if (mensuelle) return Number(mensuelle.quantity);
  const jours = lignes.filter((l) => l.period === "jour");
  return jours.length ? jours.reduce((s, l) => s + Number(l.quantity), 0) : null;
}

/**
 * Litres par unité des autres sites du même type, du même pays et de la
 * même unité d'activité (anonyme ; 50 sites au plus par comparaison).
 */
async function autresSites(ctx: Contexte, site: Site, premierJour: string, fin: string, joursDansMois: number) {
  const cle = `${site.type}:${site.country}:${site.activity_unit}:${premierJour}`;
  let parSite = ctx.comparables.get(cle);
  if (!parSite) {
    parSite = new Map<string, number>();
    const candidats = await lire(
      ctx.admin
        .from("sites")
        .select("id, capacity, occupancy_rate_default")
        .eq("type", site.type)
        .eq("country", site.country)
        .eq("activity_unit", site.activity_unit)
        .eq("active", true)
        .order("id")
        .limit(51),
    );
    for (const a of candidats) {
      const compteurs = (await compteursDuSite(ctx, a.id as string)).map((m) => m.id as string);
      const vol = await volumeSite(ctx, compteurs, premierJour, fin);
      if (vol === null) continue;
      const indicateur = indicateurActivite({
        volumeM3: vol,
        quantiteSaisie: await quantiteActivite(ctx, a.id as string, premierJour, fin),
        capacite: num(a.capacity),
        tauxOccupation: num(a.occupancy_rate_default),
        joursDansMois,
        unite: site.activity_unit,
      });
      if (indicateur) parSite.set(a.id as string, indicateur.litresParUnite);
    }
    ctx.comparables.set(cle, parSite);
  }
  return [...parSite.entries()].filter(([id]) => id !== site.id).map(([, v]) => v);
}

async function registreDuMois(ctx: Contexte, site: Site, debutMs: number, finMs: number): Promise<LigneTemperatureRapport[]> {
  const points = await lire(
    ctx.admin.from("temperature_points").select("id, label, type, threshold_c").eq("site_id", site.id),
  );
  const lignes: LigneTemperatureRapport[] = [];
  for (const p of points) {
    const releves = await lire(
      ctx.admin
        .from("temperature_readings")
        .select("ts, value_c")
        .eq("point_id", p.id as string)
        .in("quality_flag", ["valide", "corrigee"])
        .gte("ts", iso(debutMs))
        .lt("ts", iso(finMs))
        .order("ts")
        .limit(20000),
    );
    if (!releves.length) continue;
    const seuil = seuilPoint({ type: p.type as TypePoint, thresholdC: num(p.threshold_c) }, ctx.reglagesTemperature);
    const [r] = registreMensuel(
      releves.map((x) => ({ tsMs: ms(x.ts) as number, valeurC: Number(x.value_c), mois: "m" })),
      seuil,
    );
    lignes.push({
      label: p.label as string,
      type: p.type as string,
      seuilC: seuil,
      premierReleve: iso(r.premierReleveMs),
      premiereValeurC: r.premiereValeurC,
      minC: r.minC,
      maxC: r.maxC,
      nbReleves: r.nbReleves,
      nbSousSeuil: r.nbSousSeuil,
    });
  }
  return lignes;
}

async function rapportMensuel(ctx: Contexte, site: Site, premierJour: string, meterIds: string[]) {
  const fin = moisSuivant(premierJour);
  const debutMs = instantLocal(premierJour, 0, site.timezone);
  const finMs = instantLocal(fin, 0, site.timezone);
  const joursDansMois = Math.round((Date.parse(`${fin}T12:00:00Z`) - Date.parse(`${premierJour}T12:00:00Z`)) / JOUR_MS);
  const parJour = await joursDuSite(ctx, meterIds, premierJour, fin);
  const jours = [...parJour.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, j]) => ({ date, volumeM3: j.volumeM3 }));
  const reparees = await lire(
    ctx.admin
      .from("leak_events")
      .select("repaired_at, saved_m3, saved_amount")
      .eq("site_id", site.id)
      .eq("status", "reparee")
      .not("repaired_at", "is", null),
  );
  const { count: ouvertes } = await ctx.admin
    .from("leak_events")
    .select("id", { count: "exact", head: true })
    .eq("site_id", site.id)
    .in("status", ["ouverte", "prise_en_compte"]);
  const economies = (ctx.reglages.economies ?? {}) as Ligne;
  return contenuMensuel({
    site: siteRapport(site),
    mois: premierJour.slice(0, 7),
    joursDansMois,
    jours,
    volumeMoisPrecedentM3: await volumeSite(ctx, meterIds, moisPrecedent(premierJour), premierJour),
    volumeAnDernierM3: await volumeSite(ctx, meterIds, moisPrecedent(premierJour, 12), moisPrecedent(fin, 12)),
    fuitesDuMois: await fuitesDuSite(ctx, site.id, debutMs, finMs),
    fuitesOuvertes: ouvertes ?? 0,
    reparees: reparees.map((r) => ({
      repareeMs: ms(r.repaired_at) as number,
      economieM3: num(r.saved_m3),
      economieMontant: num(r.saved_amount),
    })),
    debutMoisMs: debutMs,
    finMoisMs: finMs,
    delaiJours: Number(economies.delai_decouverte_evite_jours ?? 30),
    quantiteActivite: await quantiteActivite(ctx, site.id, premierJour, fin),
    capacite: num(site.capacity),
    tauxOccupation: num(site.occupancy_rate_default),
    autresLitresParUnite:
      site.activity_unit === "aucune" ? [] : await autresSites(ctx, site, premierJour, fin, joursDansMois),
    temperatures: await registreDuMois(ctx, site, debutMs, finMs),
  }) as unknown as Ligne;
}

async function sectionRapports(ctx: Contexte) {
  const mensuelsParOrg = new Map<string, { site: Site; rapportId: string; contenu: Ligne }[]>();
  for (const site of ctx.sites.values()) {
    try {
      const l = partiesLocales(ctx.maintenantMs, site.timezone);
      if (l.heure < HEURE_RAPPORTS) continue;
      const aujourdhui = l.date;
      const compteurs = await compteursDuSite(ctx, site.id);
      const poses = compteurs
        .map((m) => ms(m.installed_at))
        .filter((v): v is number => v !== null && v <= ctx.maintenantMs);
      if (!poses.length) continue;
      const pose = dateLocale(Math.min(...poses), site.timezone);
      const meterIds = compteurs.map((m) => m.id as string);
      const dans = (jour: string, depuis: number, jusqua: number) =>
        aujourdhui >= decalerJour(jour, depuis) && aujourdhui <= decalerJour(jour, jusqua);

      if (dans(pose, 1, 2)) {
        await publierRapport(ctx, site, "premiere_nuit", decalerJour(pose, 1), () =>
          rapportPremiereNuit(ctx, site, pose, meterIds),
        );
      }
      if (dans(pose, 7, 9)) {
        await publierRapport(ctx, site, "premiere_semaine", decalerJour(pose, 7), () =>
          rapportPremiereSemaine(ctx, site, pose, meterIds),
        );
      }
      if (l.date.slice(8) <= "03") {
        const premierJour = moisPrecedent(`${aujourdhui.slice(0, 7)}-01`);
        if (pose < moisSuivant(premierJour)) {
          const id = await publierRapport(ctx, site, "mensuel", premierJour, () =>
            rapportMensuel(ctx, site, premierJour, meterIds),
          );
          if (id) {
            const { data } = await ctx.admin.from("site_reports").select("content").eq("id", id).single();
            const liste = mensuelsParOrg.get(site.organization_id) ?? [];
            liste.push({ site, rapportId: id, contenu: data?.content as Ligne });
            mensuelsParOrg.set(site.organization_id, liste);
          }
        }
      }
    } catch (e) {
      ctx.erreurs.push(`rapports ${site.id} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Synthèse de groupe : organisations de 2 sites ou plus.
  for (const [orgId, rapports] of mensuelsParOrg) {
    if (rapports.length < 2) continue;
    const org = ctx.organisations.get(orgId);
    const marque = await marqueOrganisation(ctx, orgId);
    const admins = (await membresOrganisation(ctx, orgId)).filter(
      (m) => m.portee === "organisation" && m.role === "admin_client",
    );
    const mois = String(rapports[0].contenu.mois);
    const rendu = messageGroupe(
      { marque, urlApp },
      {
        organisation: org?.nom ?? "",
        mois,
        sites: rapports.map(({ site, rapportId, contenu }) => {
          const eco = (contenu.economiesCumulees ?? {}) as { montant: number | null };
          return {
            nom: site.name,
            volumeM3: Number(contenu.volumeM3 ?? 0),
            fuites: Array.isArray(contenu.fuites) ? contenu.fuites.length : 0,
            economies: eco.montant ? montant(eco.montant, site.currency) : null,
            rapportId,
          };
        }),
      },
    );
    await prevenir(
      ctx,
      { organizationId: orgId, siteId: null, objet: "groupe", objetId: orgId, etape: `mensuel:${mois}` },
      admins,
      rendu,
      marque,
      ["email"],
    );
  }
}

// ---------------------------------------------------------------------------
// 5) Pilotes et pages preuve
// ---------------------------------------------------------------------------
function tarifsDuSite(ctx: Contexte, site: Site): Tarifs | null {
  const tarifs = (ctx.reglages.tarifs ?? {}) as Record<string, Tarifs>;
  const surcharges = (site.price_overrides ?? {}) as Record<string, Tarifs>;
  const base = tarifs[site.currency];
  if (!base) return null;
  return { ...base, ...(surcharges[site.currency] ?? {}) };
}

async function creerPagePreuve(ctx: Contexte, site: Site, debutMs: number, finMs: number) {
  const compteurs = await compteursDuSite(ctx, site.id);
  const { count: sondes } = await ctx.admin
    .from("temperature_points")
    .select("id", { count: "exact", head: true })
    .eq("site_id", site.id)
    .eq("active", true)
    .not("device_id", "is", null);
  const { count: passerelles } = await ctx.admin
    .from("devices")
    .select("id", { count: "exact", head: true })
    .eq("site_id", site.id)
    .eq("kit", "C")
    .in("provisioning_status", ["pose", "actif"]);
  const debut = dateLocale(debutMs, site.timezone);
  const fin = dateLocale(finMs, site.timezone);
  const joursSurveillance = Math.max(1, Math.round((finMs - debutMs) / JOUR_MS));
  const nuitees =
    site.activity_unit === "nuitee"
      ? ((await quantiteActivite(ctx, site.id, `${fin.slice(0, 7)}-01`, moisSuivant(`${fin.slice(0, 7)}-01`))) ??
        (site.capacity && site.occupancy_rate_default ? site.capacity * Number(site.occupancy_rate_default) * 30 : null))
      : null;
  const org = ctx.organisations.get(site.organization_id);
  const cout = coutService({
    tarifs: tarifsDuSite(ctx, site),
    nbPoints: compteurs.length,
    nbSondes: sondes ?? 0,
    avecPasserelle: (passerelles ?? 0) > 0,
    remiseFondateurPct: Number(org?.founder_discount_pct ?? 0),
    nuiteesMois: nuitees,
  });
  const parJour = await joursDuSite(ctx, compteurs.map((m) => m.id as string), debut, decalerJour(fin, 1));
  const economies = (ctx.reglages.economies ?? {}) as Ligne;
  const contenu = contenuPagePreuve({
    site: siteRapport(site),
    debut,
    fin,
    joursSurveillance,
    fuites: await fuitesDuSite(ctx, site.id, debutMs, finMs),
    finMs,
    delaiJours: Number(economies.delai_decouverte_evite_jours ?? 30),
    cout,
    courbe: [...parJour.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, j]) => ({ date, volumeM3: j.volumeM3 })),
  });
  const validite = Number(((ctx.reglages.pages_preuve ?? {}) as Ligne).validite_jours ?? 90);
  const { data, error } = await ctx.admin
    .from("proof_pages")
    .insert({
      organization_id: site.organization_id,
      site_id: site.id,
      period_start: debut,
      period_end: fin,
      content: contenu,
      expires_at: iso(ctx.maintenantMs + validite * JOUR_MS),
    })
    .select("id, token, expires_at")
    .single();
  if (error) throw new Error(error.message);
  compter(ctx, "pages_preuve");
  return data as { id: string; token: string; expires_at: string };
}

async function sectionPilotes(ctx: Contexte) {
  const orgIds = [...ctx.organisations.keys()];
  if (!orgIds.length) return;
  const reglages = (ctx.reglages.pilotes ?? {}) as Ligne;
  const jourResume = Number(reglages.resume_jour ?? 25);
  const pilotes = await lire(
    ctx.admin
      .from("pilots")
      .select("id, organization_id, site_id, started_at, ends_at, status, auto_convert_consent, consent_at, consent_by_name, setup_refund_if_nothing_found, anomalies_found")
      .in("organization_id", orgIds)
      .in("status", ["en_cours", "prolonge"])
      .lte("started_at", iso(ctx.maintenantMs)),
  );
  for (const p of pilotes) {
    const site = ctx.sites.get(p.site_id as string);
    if (!site) continue;
    try {
      const debutMs = ms(p.started_at) as number;
      const finMs = ms(p.ends_at) as number;
      const dureeJours = Math.round((finMs - debutMs) / JOUR_MS);
      const membres = await membresOrganisation(ctx, site.organization_id);

      // J+25 : résumé et page preuve, au client et à SmartMeteria.
      if (ctx.maintenantMs >= debutMs + jourResume * JOUR_MS) {
        const periode = dateLocale(finMs, site.timezone);
        const destinataires = [...clientDuSite(membres, site.id), ...(await superadmins(ctx))];
        await publierRapport(
          ctx,
          site,
          "fin_pilote",
          periode,
          async () => {
            const preuve = await creerPagePreuve(ctx, site, debutMs, ctx.maintenantMs);
            const economies = (ctx.reglages.economies ?? {}) as Ligne;
            return contenuFinPilote({
              site: siteRapport(site),
              debut: dateLocale(debutMs, site.timezone),
              fin: periode,
              dureeJours,
              fuites: await fuitesDuSite(ctx, site.id, debutMs, ctx.maintenantMs),
              finMs: ctx.maintenantMs,
              delaiJours: Number(economies.delai_decouverte_evite_jours ?? 30),
              pagePreuve: { token: preuve.token, expireLe: preuve.expires_at },
            }) as unknown as Ligne;
          },
          destinataires,
        );
      }

      // J+30 : conversion avec consentement écrit, sinon tâche d'appel.
      if (ctx.maintenantMs >= finMs && p.status === "en_cours") {
        if (p.auto_convert_consent && p.consent_at && p.consent_by_name) {
          await lire(
            ctx.admin
              .from("pilots")
              .update({ status: "converti", converted_at: iso(ctx.maintenantMs) })
              .eq("id", p.id as string)
              .eq("status", "en_cours")
              .select("id"),
          );
          await ctx.admin
            .from("organizations")
            .update({ status: "actif" })
            .eq("id", site.organization_id)
            .eq("status", "essai");
          const marque = await marqueOrganisation(ctx, site.organization_id);
          await prevenir(
            ctx,
            { organizationId: site.organization_id, siteId: site.id, objet: "pilote", objetId: p.id as string, etape: "confirmation" },
            clientDuSite(membres, site.id),
            messageConversion(
              { marque, urlApp },
              {
                site: site.name,
                consentementLe: p.consent_at as string,
                consentementPar: p.consent_by_name as string,
                fuseau: site.timezone,
              },
            ),
            marque,
            ["email"],
          );
          compter(ctx, "pilotes_convertis");
        } else {
          const { error } = await ctx.admin.from("admin_tasks").insert({
            organization_id: site.organization_id,
            site_id: site.id,
            pilot_id: p.id,
            kind: "appel_conversion",
            due_at: iso(finMs),
            details: { site: site.name, fin: dateLocale(finMs, site.timezone), anomalies: p.anomalies_found },
          });
          if (!error) compter(ctx, "taches");
        }
        if (p.setup_refund_if_nothing_found && Number(p.anomalies_found) === 0) {
          const { error } = await ctx.admin.from("admin_tasks").insert({
            organization_id: site.organization_id,
            site_id: site.id,
            pilot_id: p.id,
            kind: "remboursement_retrait",
            due_at: iso(finMs),
            details: { site: site.name, motif: "Aucune anomalie trouvée pendant le pilote." },
          });
          if (!error) compter(ctx, "taches");
        }
      }
    } catch (e) {
      ctx.erreurs.push(`pilote ${p.id} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 6) Rapports non ouverts depuis 2 mois
// ---------------------------------------------------------------------------
async function sectionSuivi(ctx: Contexte) {
  const limite = iso(ctx.maintenantMs - 60 * JOUR_MS);
  for (const org of ctx.organisations.values()) {
    const { count: anciens } = await ctx.admin
      .from("site_reports")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .not("sent_at", "is", null)
      .lte("sent_at", limite);
    if (!anciens) continue;
    const { count: ouverts } = await ctx.admin
      .from("site_reports")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .gte("opened_at", limite);
    if (ouverts) continue;
    const { error } = await ctx.admin.from("admin_tasks").insert({
      organization_id: org.id,
      kind: "rapports_non_ouverts",
      details: { organisation: org.nom, depuis: limite },
    });
    if (!error) compter(ctx, "taches");
  }
}

// ---------------------------------------------------------------------------
// Récapitulatif quotidien au superadmin (plan, phase G10) : une fois par
// jour à partir de 7 h, heure de Paris ; la ligne de taches_executions
// (tâche + jour, unique) empêche un second envoi. Pas de ligne dans le
// journal des envois (il appartient aux organisations).
async function sectionRecapitulatif(ctx: Contexte) {
  if (!ctx.plateforme) return;
  const l = partiesLocales(ctx.maintenantMs, "Europe/Paris");
  if (l.heure < HEURE_RECAPITULATIF) return;
  const { data: passage, error } = await ctx.admin
    .from("taches_executions")
    .insert({ tache: "recapitulatif-quotidien", cle: l.date, debut: iso(ctx.maintenantMs), statut: "en_cours" })
    .select("id")
    .single();
  if (error) {
    if (error.code !== "23505") throw new Error(error.message);
    return;
  }
  const depuis = iso(ctx.maintenantMs - 24 * HEURE_MS);
  const dans7Jours = iso(ctx.maintenantMs + 7 * JOUR_MS);
  const compterEnvois = async (statut: string) =>
    (await ctx.admin.from("envois").select("id", { count: "exact", head: true }).eq("statut", statut).gt("created_at", depuis)).count ?? 0;
  const { data: etat, error: erreurEtat } = await ctx.admin.rpc("etat_taches_planifiees");
  if (erreurEtat) throw new Error(erreurEtat.message);
  const { count: fuites } = await ctx.admin
    .from("leak_events")
    .select("id", { count: "exact", head: true })
    .gt("detected_at", depuis);
  const { count: aFaire } = await ctx.admin
    .from("admin_tasks")
    .select("id", { count: "exact", head: true })
    .eq("status", "a_faire");
  const pilotes = await lire(
    ctx.admin
      .from("pilots")
      .select("ends_at, sites(name, timezone), organizations(nom)")
      .in("status", ["en_cours", "prolonge"])
      .gte("ends_at", iso(ctx.maintenantMs))
      .lte("ends_at", dans7Jours)
      .order("ends_at")
      .limit(20),
  );
  const essais = await lire(
    ctx.admin
      .from("organizations")
      .select("nom, trial_ends_at")
      .eq("kind", "sites")
      .eq("status", "essai")
      .gte("trial_ends_at", iso(ctx.maintenantMs))
      .lte("trial_ends_at", dans7Jours)
      .order("trial_ends_at")
      .limit(20),
  );
  const un = (v: unknown) => ((Array.isArray(v) ? v[0] : v) ?? null) as Ligne | null;
  const donnees = {
    jour: l.date,
    taches: lignesSurveillance(etat as EtatTaches, ctx.maintenantMs),
    appelsHttp: (etat as EtatTaches).appels_http,
    envois: {
      envoyes: await compterEnvois("envoye"),
      echecs: await compterEnvois("echec"),
      journalises: await compterEnvois("journalise"),
    },
    fuitesDetectees: fuites ?? 0,
    tachesAFaire: aFaire ?? 0,
    pilotes: pilotes.map((p) => {
      const site = un(p.sites);
      return {
        site: (site?.name as string) ?? "",
        organisation: (un(p.organizations)?.nom as string) ?? "",
        fin: dateLocale(ms(p.ends_at) as number, (site?.timezone as string) ?? "Europe/Paris"),
      };
    }),
    essais: essais.map((o) => ({ organisation: o.nom as string, fin: dateLocale(ms(o.trial_ends_at) as number, "Europe/Paris") })),
  };
  const message = messageRecapitulatif(MARQUE_PLATEFORME, urlApp, donnees);
  const statuts: string[] = [];
  for (const m of await superadmins(ctx)) {
    if (!m.email) continue;
    const r = await notify(
      {
        canal: "email",
        destinataire: m.email,
        sujet: message.sujet,
        texte: message.texte,
        html: message.html,
        expediteur: MARQUE_PLATEFORME.expediteur,
        repondreA: null,
      },
      ctx.config,
    );
    statuts.push(r.statut);
  }
  await ctx.admin
    .from("taches_executions")
    .update({
      fin: new Date().toISOString(),
      statut: statuts.includes("echec") ? "partiel" : "ok",
      bilan: {
        destinataires: statuts.length,
        mode: ctx.config.mode,
        statuts,
        taches_a_regarder: donnees.taches.filter((t) => t.etat === "en_echec" || t.etat === "en_retard").length,
      },
    })
    .eq("id", passage.id);
  compter(ctx, "recapitulatifs");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erreur: "Méthode non autorisée." }, 405);
  const corps = (await req.json().catch(() => ({}))) as Ligne;
  const service = roleAppelant(req) === "service_role";
  const maintenantDemande = typeof corps.maintenant === "string" ? Date.parse(corps.maintenant) : NaN;
  const maintenantMs = service && Number.isFinite(maintenantDemande) ? maintenantDemande : Date.now();
  const orgDemandee = service && typeof corps.organization_id === "string" ? corps.organization_id : null;
  const sections = new Set<Section>(
    service && Array.isArray(corps.sections)
      ? (corps.sections as string[]).filter((s): s is Section => (SECTIONS as readonly string[]).includes(s))
      : SECTIONS,
  );

  // Passage planifié (pg_cron, corps vide) : journalisé dans taches_executions.
  const planifie = Object.keys(corps).length === 0;
  const debutMs = Date.now();
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const journaliser = async (statut: "ok" | "partiel" | "echec", bilan: Ligne, erreurs: string[]) => {
    if (!planifie) return;
    await admin.from("taches_executions").insert({
      tache: "gardien-envois",
      debut: iso(debutMs),
      fin: new Date().toISOString(),
      statut,
      bilan,
      erreurs: erreurs.slice(0, 20),
    });
  };
  // Message de test du superadmin (service_role, depuis l'espace superadmin) :
  // même chaîne que les alertes, sans ligne dans le journal des envois.
  if (service && corps.message_test && typeof corps.message_test === "object") {
    const validation = validerMessageTest(corps.message_test as Ligne);
    if (!validation.ok) return json({ erreur: validation.erreur }, 400);
    const config = configEnvois(Deno.env.toObject());
    const resultats: ResultatTest[] = [];
    for (const m of messagesTest(MARQUE_PLATEFORME, validation.demande, urlApp)) {
      const r = await notify(m, config);
      resultats.push({ canal: m.canal, mode: r.mode, statut: r.statut, fournisseur: r.fournisseur, erreur: r.erreur });
    }
    return json({ mode: config.mode, resultats });
  }

  const reglagesBruts = await admin
    .from("platform_settings")
    .select("key, value")
    .in("key", ["alertes", "economies", "pilotes", "pages_preuve", "tarifs", "temperatures"]);
  if (reglagesBruts.error) {
    await journaliser("echec", {}, [reglagesBruts.error.message]);
    return json({ erreur: reglagesBruts.error.message }, 500);
  }
  const reglages = Object.fromEntries((reglagesBruts.data ?? []).map((r) => [r.key, r.value as Ligne]));

  let requeteOrgs = admin
    .from("organizations")
    .select("id, nom, status, founder_discount_pct")
    .eq("kind", "sites")
    .in("status", ["essai", "actif"]);
  if (orgDemandee) requeteOrgs = requeteOrgs.eq("id", orgDemandee);
  const { data: orgs, error: erreurOrgs } = await requeteOrgs;
  if (erreurOrgs) {
    await journaliser("echec", {}, [erreurOrgs.message]);
    return json({ erreur: erreurOrgs.message }, 500);
  }
  const organisations = new Map((orgs ?? []).map((o) => [o.id as string, o as Organisation]));
  const { data: sites, error: erreurSites } = organisations.size
    ? await admin
        .from("sites")
        .select("id, organization_id, name, type, city, country, timezone, currency, water_price_per_m3, activity_unit, capacity, occupancy_rate_default, price_overrides")
        .in("organization_id", [...organisations.keys()])
        .eq("active", true)
    : { data: [], error: null };
  if (erreurSites) {
    await journaliser("echec", {}, [erreurSites.message]);
    return json({ erreur: erreurSites.message }, 500);
  }

  const ctx: Contexte = {
    admin,
    maintenantMs,
    plateforme: !orgDemandee && !Number.isFinite(maintenantDemande),
    config: configEnvois(Deno.env.toObject()),
    reglages,
    reglagesTemperature: lireReglagesTemperature(reglages.temperatures),
    organisations,
    sites: new Map((sites ?? []).map((s) => [s.id as string, s as Site])),
    membres: new Map(),
    emails: new Map(),
    marques: new Map(),
    superadmins: null,
    comparables: new Map(),
    bilan: {},
    erreurs: [],
  };

  // Page preuve à la demande (service_role) : les 30 derniers jours.
  if (service && typeof corps.page_preuve === "string") {
    const { data: s } = await admin
      .from("sites")
      .select("id, organization_id, name, type, city, country, timezone, currency, water_price_per_m3, activity_unit, capacity, occupancy_rate_default, price_overrides")
      .eq("id", corps.page_preuve)
      .maybeSingle();
    if (!s) return json({ erreur: "Site introuvable." }, 404);
    if (!ctx.organisations.has(s.organization_id as string)) {
      const { data: o } = await admin
        .from("organizations")
        .select("id, nom, status, founder_discount_pct")
        .eq("id", s.organization_id)
        .single();
      ctx.organisations.set(s.organization_id as string, o as Organisation);
    }
    try {
      const page = await creerPagePreuve(ctx, s as Site, maintenantMs - 30 * JOUR_MS, maintenantMs);
      return json({ token: page.token, expires_at: page.expires_at });
    } catch (e) {
      return json({ erreur: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  const etapes: [Section, (c: Contexte) => Promise<void>][] = [
    ["fuites", sectionFuites],
    ["alertes", sectionAlertes],
    ["poses", sectionPoses],
    ["rapports", sectionRapports],
    ["pilotes", sectionPilotes],
    ["suivi", sectionSuivi],
    ["recapitulatif", sectionRecapitulatif],
  ];
  for (const [nom, executer] of etapes) {
    if (!sections.has(nom)) continue;
    try {
      await executer(ctx);
    } catch (e) {
      ctx.erreurs.push(`${nom} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const bilan = {
    maintenant: iso(maintenantMs),
    mode: ctx.config.mode,
    organisations: organisations.size,
    ...ctx.bilan,
  };
  await journaliser(ctx.erreurs.length ? "partiel" : "ok", bilan, ctx.erreurs);
  return json({ ...bilan, erreurs: ctx.erreurs }, ctx.erreurs.length ? 207 : 200);
});
