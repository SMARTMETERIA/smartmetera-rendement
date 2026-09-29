// Moteur du Gardien de l'eau (phase G4), déclenché toutes les heures par
// pg_cron via pg_net (voir supabase/migrations/0041_gardien_moteur.sql).
// Pour chaque site actif d'une organisation Gardien (kind = 'sites', en
// essai ou active) : bilans quotidiens des points de comptage (meter_days),
// fuites (leak_events : nuit, débit continu, rupture, fermeture),
// réparations automatiques avec économies prudentes (calculées en SQL par
// fuite_cloturer_reparee), capteurs muets, températures basses et rappel
// des analyses (alerts). Toute la logique est dans lib/analyse.ts, copie
// testée de src/lib/moteur-gardien (node scripts/synchroniser-ingest.mjs).
//
// verify_jwt reste activé : pg_cron s'authentifie avec la clé « anon ».
// Corps facultatif, pris en compte seulement pour un appel service_role
// (tests, rattrapage) : {"site_id": "...", "maintenant": "ISO", "jours": 30}.
// Aucun envoi (SMS, e-mail) ici : les alertes partent en phase G5.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  FENETRE_LIGNE_DE_BASE_JOURS,
  analyserSite,
  debutFenetre,
  joursARecalculer,
  type AlerteConnue,
  type AppareilSurveille,
  type CompteurSite,
  type FuiteConnue,
  type JourStocke,
  type PointTemperature,
  type StatutFuite,
  type TypeFuite,
} from "./lib/analyse.ts";
import type { Releve } from "./lib/debits.ts";
import { lirePeriodesFermeture, type PlageCalme } from "./lib/plages.ts";
import { REGLAGES_DEFAUT, fusionnerReglages, type ReglagesDetection } from "./lib/reglages.ts";
import { lireReglagesTemperature, type ReglagesTemperature, type TypePoint } from "./lib/temperatures.ts";
import { HEURE_MS, decalerJour } from "./lib/temps.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PAGE = 1000;
const JOURS_MAX = 120;

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
const ms = (v: string | null | undefined) => (v ? Date.parse(v) : null);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

type Ligne = Record<string, unknown>;

/** Lecture paginée (PostgREST renvoie 1 000 lignes au plus par requête). */
async function toutLire(
  construire: (debut: number, fin: number) => PromiseLike<{ data: Ligne[] | null; error: { message: string } | null }>,
): Promise<Ligne[]> {
  const lignes: Ligne[] = [];
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await construire(debut, debut + PAGE - 1);
    if (error) throw new Error(error.message);
    lignes.push(...(data ?? []));
    if (!data || data.length < PAGE) return lignes;
  }
}

async function verifier<T>(promesse: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await promesse;
  if (error) throw new Error(error.message);
  return data;
}

interface Site {
  id: string;
  organization_id: string;
  name: string;
  timezone: string;
  currency: "EUR" | "MAD";
  closed_periods: unknown;
  organizations: { settings: Ligne | null };
}

interface Contexte {
  admin: SupabaseClient;
  maintenantMs: number;
  nbJours: number;
  seuilsPlateforme: Ligne | null;
  reglagesTemperature: ReglagesTemperature;
  partenaires: Map<string, boolean>;
}

interface Bilan {
  jours: number;
  fuites: number;
  reparations: number;
  alertes: number;
  resolues: number;
}

async function estPartenaire(ctx: Contexte, organizationId: string): Promise<boolean> {
  const connu = ctx.partenaires.get(organizationId);
  if (connu !== undefined) return connu;
  const [clients, marque] = await Promise.all([
    ctx.admin.from("clients").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    ctx.admin.from("org_branding").select("organization_id", { count: "exact", head: true }).eq("organization_id", organizationId),
  ]);
  const resultat = (clients.count ?? 0) > 0 || (marque.count ?? 0) > 0;
  ctx.partenaires.set(organizationId, resultat);
  return resultat;
}

async function traiterSite(ctx: Contexte, site: Site): Promise<Bilan> {
  const { admin, maintenantMs } = ctx;
  const fuseau = site.timezone;
  const jours = joursARecalculer(maintenantMs, fuseau, ctx.nbJours);
  const reglagesOrg = ((site.organizations?.settings ?? {}) as Ligne).gardien as Ligne | undefined;
  const reglages: ReglagesDetection = fusionnerReglages(
    fusionnerReglages(REGLAGES_DEFAUT, ctx.seuilsPlateforme),
    (reglagesOrg?.seuils ?? null) as Ligne | null,
  );

  const [meters, devices, points, plagesBrutes] = await Promise.all([
    verifier(
      admin
        .from("meters")
        .select("id, nom, zone, surveillance, installed_at")
        .eq("site_id", site.id)
        .eq("type", "point_comptage")
        .eq("actif", true),
    ),
    verifier(
      admin
        .from("devices")
        .select("id, meter_id, model, device_ref, transmission, last_seen_at")
        .eq("site_id", site.id)
        .in("provisioning_status", ["pose", "actif"]),
    ),
    verifier(
      admin
        .from("temperature_points")
        .select("id, label, type, threshold_c, device_id, created_at")
        .eq("site_id", site.id)
        .eq("active", true),
    ),
    verifier(
      admin
        .from("quiet_windows")
        .select("meter_id, weekdays, start_local, end_local, starts_on, ends_on")
        .eq("site_id", site.id)
        .eq("active", true),
    ),
  ]);

  const compteurs: CompteurSite[] = (meters as Ligne[]).map((m) => ({
    id: m.id as string,
    nom: (m.zone as string | null) ?? (m.nom as string),
    zone: m.zone as string | null,
    surveillance: m.surveillance === "limitee" ? "limitee" : "complete",
  }));
  const meterIds = compteurs.map((c) => c.id);
  const pointIds = (points as Ligne[]).map((p) => p.id as string);

  const debutHistorique = decalerJour(jours[0], -FENETRE_LIGNE_DE_BASE_JOURS);
  const [lecturesBrutes, historiqueBrut, fuitesBrutes, temperaturesBrutes, alertesBrutes] = await Promise.all([
    meterIds.length
      ? toutLire((a, b) =>
          admin
            .from("readings")
            .select("meter_id, ts, volume_m3")
            .in("meter_id", meterIds)
            .in("quality_flag", ["valide", "corrigee"])
            .gt("ts", iso(debutFenetre(jours, fuseau)))
            .lte("ts", iso(maintenantMs))
            .order("meter_id")
            .order("ts")
            .range(a, b),
        )
      : Promise.resolve([]),
    meterIds.length
      ? toutLire((a, b) =>
          admin
            .from("meter_days")
            .select("meter_id, day, night_min_lph, max_hourly_lph, closed, baseline_lph, threshold_lph")
            .in("meter_id", meterIds)
            .gte("day", debutHistorique)
            .lt("day", jours[0])
            .order("meter_id")
            .order("day")
            .range(a, b),
        )
      : Promise.resolve([]),
    verifier(
      admin
        .from("leak_events")
        .select("id, meter_id, type, status, started_at, detected_at, repaired_at, updated_at, details")
        .eq("site_id", site.id)
        .or(`status.in.(ouverte,prise_en_compte),detected_at.gte.${debutHistorique}`),
    ),
    pointIds.length
      ? verifier(
          admin
            .from("temperature_readings")
            .select("point_id, ts, value_c")
            .in("point_id", pointIds)
            .in("quality_flag", ["valide", "corrigee"])
            .gt("ts", iso(maintenantMs - 3 * HEURE_MS))
            .lte("ts", iso(maintenantMs))
            .order("ts", { ascending: false }),
        )
      : Promise.resolve([]),
    verifier(
      admin
        .from("alerts")
        .select("id, type, statut, cle:donnees->>cle")
        .eq("site_id", site.id)
        .in("type", ["compteur_muet", "temperature_basse", "rappel_analyses"])
        .or("statut.in.(ouverte,acquittee),type.eq.rappel_analyses"),
    ),
  ]);

  const releves: Record<string, Releve[]> = {};
  for (const l of lecturesBrutes) {
    const liste = (releves[l.meter_id as string] ??= []);
    liste.push({ tsMs: Date.parse(l.ts as string), volumeM3: Number(l.volume_m3) });
  }
  const historique: Record<string, JourStocke[]> = {};
  for (const h of historiqueBrut) {
    (historique[h.meter_id as string] ??= []).push({
      day: h.day as string,
      nightMinLph: num(h.night_min_lph),
      maxHourlyLph: num(h.max_hourly_lph),
      closed: h.closed === true,
      baselineLph: num(h.baseline_lph),
      thresholdLph: num(h.threshold_lph),
    });
  }
  const fuites: FuiteConnue[] = (fuitesBrutes as Ligne[]).map((f) => {
    const details = (f.details ?? {}) as Ligne;
    const fausse = (details.fausse_alerte ?? null) as Ligne | null;
    const status = f.status as StatutFuite;
    return {
      id: f.id as string,
      meterId: f.meter_id as string,
      type: f.type as TypeFuite,
      status,
      startedAtMs: ms(f.started_at as string | null),
      detectedAtMs: Date.parse(f.detected_at as string),
      closedAtMs:
        status === "reparee"
          ? ms(f.repaired_at as string | null)
          : status === "fausse_alerte"
            ? (ms(fausse?.le as string | undefined) ?? ms(f.updated_at as string))
            : null,
    };
  });
  const plages: PlageCalme[] = (plagesBrutes as Ligne[]).map((p) => ({
    meterId: p.meter_id as string | null,
    joursIso: p.weekdays as number[] | null,
    debut: p.start_local as string,
    fin: p.end_local as string,
    depuis: p.starts_on as string | null,
    jusqua: p.ends_on as string | null,
  }));

  const derniereTemperature = new Map<string, Ligne>();
  for (const t of temperaturesBrutes as Ligne[]) {
    if (!derniereTemperature.has(t.point_id as string)) derniereTemperature.set(t.point_id as string, t);
  }
  const pointsTemperature: PointTemperature[] = (points as Ligne[]).map((p) => {
    const t = derniereTemperature.get(p.id as string);
    return {
      id: p.id as string,
      label: p.label as string,
      type: p.type as TypePoint,
      thresholdC: num(p.threshold_c),
      derniereValeurC: t ? Number(t.value_c) : null,
      dernierReleveMs: t ? Date.parse(t.ts as string) : null,
    };
  });

  const compteurParId = new Map((meters as Ligne[]).map((m) => [m.id as string, m]));
  const pointParAppareil = new Map(
    (points as Ligne[]).filter((p) => p.device_id).map((p) => [p.device_id as string, p]),
  );
  const appareils: AppareilSurveille[] = (devices as Ligne[]).map((a) => {
    const compteur = a.meter_id ? compteurParId.get(a.meter_id as string) : undefined;
    const point = pointParAppareil.get(a.id as string);
    const nom =
      (compteur ? ((compteur.zone as string | null) ?? (compteur.nom as string)) : null) ??
      (point?.label as string | undefined) ??
      `${(a.model as string | null) ?? "Capteur"} ${a.device_ref as string}`;
    return {
      id: a.id as string,
      nom,
      meterId: (a.meter_id as string | null) ?? null,
      pointId: (point?.id as string | undefined) ?? null,
      transmission: a.transmission as string | null,
      dernierMessageMs: ms(a.last_seen_at as string | null),
      poseMs: ms((compteur?.installed_at ?? point?.created_at ?? null) as string | null),
    };
  });
  const alertes: AlerteConnue[] = (alertesBrutes as Ligne[])
    .filter((a) => typeof a.cle === "string")
    .map((a) => ({
      id: a.id as string,
      type: a.type as string,
      cle: a.cle as string,
      enCours: a.statut === "ouverte" || a.statut === "acquittee",
    }));

  const resultat = analyserSite({
    siteId: site.id,
    fuseau,
    periodesFermeture: lirePeriodesFermeture(site.closed_periods),
    maintenantMs,
    jours,
    reglages,
    reglagesTemperature: ctx.reglagesTemperature,
    compteurs,
    releves,
    historique,
    plages,
    fuites,
    appareils,
    points: pointsTemperature,
    alertes,
  });

  // Écritures : bilans, réparations, nouvelles fuites, alertes.
  const maintenant = new Date().toISOString();
  const lignesJours = resultat.jours.map((j) => ({
    organization_id: site.organization_id,
    site_id: site.id,
    meter_id: j.meterId,
    day: j.day,
    volume_m3: j.volumeM3,
    hours_covered: j.hoursCovered,
    night_min_lph: j.nightMinLph,
    night_hours: j.nightHours,
    quiet_hours: j.quietHours,
    max_hourly_lph: j.maxHourlyLph,
    min_hourly_lph: j.minHourlyLph,
    closed: j.closed,
    baseline_lph: j.baselineLph,
    threshold_lph: j.thresholdLph,
    baseline_mode: j.baselineMode,
    leak_night: j.leakNight,
    updated_at: maintenant,
  }));
  for (let i = 0; i < lignesJours.length; i += 500) {
    await verifier(admin.from("meter_days").upsert(lignesJours.slice(i, i + 500), { onConflict: "meter_id,day" }));
  }

  for (const id of resultat.reparations) {
    await verifier(
      admin.rpc("fuite_cloturer_reparee", {
        p_leak_id: id,
        p_source: "automatique",
        p_quand: iso(maintenantMs),
        p_par: null,
      }),
    );
  }

  let fuitesOuvertes = 0;
  for (const f of resultat.nouvellesFuites) {
    const { error } = await admin.from("leak_events").insert({
      organization_id: site.organization_id,
      site_id: site.id,
      meter_id: f.meterId,
      type: f.type,
      started_at: iso(f.startedAtMs),
      detected_at: iso(maintenantMs),
      excess_flow_lph: f.excesLph,
      currency: site.currency,
      details: f.details,
    });
    // 23505 : une fuite du même type est déjà ouverte sur ce point.
    if (error && error.code !== "23505") throw new Error(error.message);
    if (!error) fuitesOuvertes++;
  }

  let alertesOuvertes = 0;
  const partenaire = resultat.alertesAOuvrir.some((a) => a.type === "compteur_muet")
    ? await estPartenaire(ctx, site.organization_id)
    : false;
  for (const a of resultat.alertesAOuvrir) {
    const { error } = await admin.from("alerts").insert({
      organization_id: site.organization_id,
      site_id: site.id,
      type: a.type,
      severite: a.severite,
      titre: a.titre,
      description: a.description,
      declenchee_le: iso(maintenantMs),
      donnees: {
        ...a.donnees,
        cle: a.cle,
        // Capteur muet : au partenaire (ou à SmartMetera), jamais au client
        // en premier (plan, phase G4). Envoi en phase G5.
        destinataire: a.type === "compteur_muet" ? (partenaire ? "partenaire" : "smartmetera") : "site",
      },
    });
    if (error && error.code !== "23505") throw new Error(error.message);
    if (!error) alertesOuvertes++;
  }

  if (resultat.alertesAResoudre.length) {
    await verifier(
      admin
        .from("alerts")
        .update({ statut: "resolue", resolue_le: iso(maintenantMs) })
        .in("id", resultat.alertesAResoudre),
    );
  }

  return {
    jours: lignesJours.length,
    fuites: fuitesOuvertes,
    reparations: resultat.reparations.length,
    alertes: alertesOuvertes,
    resolues: resultat.alertesAResoudre.length,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ erreur: "Méthode non autorisée." }, 405);
  }
  const corps = (await req.json().catch(() => ({}))) as Ligne;
  const service = roleAppelant(req) === "service_role";
  const maintenantDemande = typeof corps.maintenant === "string" ? Date.parse(corps.maintenant) : NaN;
  const maintenantMs = service && Number.isFinite(maintenantDemande) ? maintenantDemande : Date.now();
  const nbJours =
    service && typeof corps.jours === "number" && Number.isInteger(corps.jours)
      ? Math.min(Math.max(corps.jours, 2), JOURS_MAX)
      : 2;
  const siteDemande = service && typeof corps.site_id === "string" ? corps.site_id : null;

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const reglagesBruts = await admin
    .from("platform_settings")
    .select("key, value")
    .in("key", ["seuils", "temperatures"]);
  if (reglagesBruts.error) return json({ erreur: reglagesBruts.error.message }, 500);
  const reglage = (cle: string) =>
    ((reglagesBruts.data ?? []).find((r) => r.key === cle)?.value ?? null) as Ligne | null;

  let requete = admin
    .from("sites")
    .select("id, organization_id, name, timezone, currency, closed_periods, organizations!inner(settings, kind, status)")
    .eq("active", true)
    .eq("organizations.kind", "sites")
    .in("organizations.status", ["essai", "actif"]);
  if (siteDemande) requete = requete.eq("id", siteDemande);
  const { data: sites, error } = await requete;
  if (error) return json({ erreur: error.message }, 500);

  const ctx: Contexte = {
    admin,
    maintenantMs,
    nbJours,
    seuilsPlateforme: reglage("seuils"),
    reglagesTemperature: lireReglagesTemperature(reglage("temperatures")),
    partenaires: new Map(),
  };

  const total: Bilan = { jours: 0, fuites: 0, reparations: 0, alertes: 0, resolues: 0 };
  const erreurs: { site_id: string; message: string }[] = [];
  for (const site of (sites ?? []) as unknown as Site[]) {
    try {
      const bilan = await traiterSite(ctx, site);
      for (const cle of Object.keys(total) as (keyof Bilan)[]) total[cle] += bilan[cle];
    } catch (e) {
      erreurs.push({ site_id: site.id, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return json({
    maintenant: iso(maintenantMs),
    sites: (sites ?? []).length,
    ...total,
    erreurs,
  }, erreurs.length ? 207 : 200);
});
