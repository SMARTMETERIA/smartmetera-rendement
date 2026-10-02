// Autonomie en eau côté serveur (phase G11) : chargement des réserves, des
// niveaux, des arrivées du réseau et des coupures d'un ensemble de sites
// (droits de la personne connectée), réglages de plateforme lus avec la clé
// de service (platform_settings n'est lisible que par le superadmin).
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  analyserAutonomie,
  lireReglagesAutonomie,
  type EtatAutonomie,
  type MesureNiveau,
  type ReglagesAutonomie,
} from "@/lib/moteur-gardien/autonomie";
import { COLONNES_RESERVE, reserveDepuisLigne, type ReserveEau } from "@/lib/moteur-gardien/reserves";
import { HEURE_MS } from "@/lib/moteur-gardien/temps";
import type { Releve } from "@/lib/moteur-gardien/debits";

type Ligne = Record<string, unknown>;
const PAGE = 1000;

export async function reglagesAutonomiePlateforme(): Promise<unknown> {
  const { data } = await createAdminClient()
    .from("platform_settings")
    .select("value")
    .eq("key", "autonomie")
    .maybeSingle();
  return data?.value ?? null;
}

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

export interface ReserveSite extends ReserveEau {
  siteId: string;
  kind: string;
  deviceId: string | null;
}

export interface CoupureSite {
  id: string;
  debutMs: number;
  finMs: number | null;
  autonomieMinH: number | null;
}

export interface AutonomieSite {
  siteId: string;
  reserves: ReserveSite[];
  compteursArrivee: string[];
  etat: EtatAutonomie;
  coupures: CoupureSite[];
  reglages: ReglagesAutonomie;
}

/**
 * Autonomie de chaque site qui a au moins une réserve active. Lecture avec
 * le client de la personne (règles d'accès), calcul identique au moteur.
 */
export async function chargerAutonomie(
  supabase: SupabaseClient,
  sites: { id: string; timezone: string; reglagesOrganisation: unknown }[],
  maintenantMs: number,
): Promise<Map<string, AutonomieSite>> {
  const resultat = new Map<string, AutonomieSite>();
  if (!sites.length) return resultat;
  const siteIds = sites.map((s) => s.id);
  const { data: lignesReserves } = await supabase
    .from("water_reserves")
    .select(`${COLONNES_RESERVE}, site_id, kind, device_id`)
    .in("site_id", siteIds)
    .eq("active", true)
    .order("label");
  const reserves: ReserveSite[] = ((lignesReserves ?? []) as Ligne[]).map((l) => ({
    ...reserveDepuisLigne(l),
    siteId: l.site_id as string,
    kind: l.kind as string,
    deviceId: (l.device_id as string | null) ?? null,
  }));
  const avecReserves = sites.filter((s) => reserves.some((r) => r.siteId === s.id));
  if (!avecReserves.length) return resultat;

  const plateforme = await reglagesAutonomiePlateforme();
  const profilMax = Math.max(
    ...avecReserves.map((s) => lireReglagesAutonomie(plateforme, s.reglagesOrganisation).profilJours),
  );
  const depuis = new Date(maintenantMs - (profilMax * 24 + 4) * HEURE_MS).toISOString();
  const jusqua = new Date(maintenantMs).toISOString();
  const idsReserves = reserves.map((r) => r.id);
  const idsSites = avecReserves.map((s) => s.id);

  const [niveaux, { data: compteurs }, { data: coupures }] = await Promise.all([
    toutLire((a, b) =>
      supabase
        .from("reserve_levels")
        .select("reserve_id, ts, measure_m")
        .in("reserve_id", idsReserves)
        .in("quality_flag", ["valide", "corrigee"])
        .gt("ts", depuis)
        .lte("ts", jusqua)
        .order("reserve_id")
        .order("ts")
        .range(a, b),
    ),
    supabase
      .from("meters")
      .select("id, site_id")
      .in("site_id", idsSites)
      .eq("type", "point_comptage")
      .eq("actif", true)
      .eq("public_inlet", true),
    supabase
      .from("supply_cuts")
      .select("id, site_id, started_at, ended_at, status, min_autonomy_h")
      .in("site_id", idsSites)
      .order("started_at", { ascending: false })
      .limit(50),
  ]);
  const inlets = (compteurs ?? []) as Ligne[];
  const lectures = inlets.length
    ? await toutLire((a, b) =>
        supabase
          .from("readings")
          .select("meter_id, ts, volume_m3")
          .in("meter_id", inlets.map((m) => m.id as string))
          .in("quality_flag", ["valide", "corrigee"])
          .gt("ts", depuis)
          .lte("ts", jusqua)
          .order("meter_id")
          .order("ts")
          .range(a, b),
      )
    : [];

  const mesures = new Map<string, MesureNiveau[]>();
  for (const n of niveaux) {
    const liste = mesures.get(n.reserve_id as string) ?? [];
    liste.push({ tsMs: Date.parse(n.ts as string), mesureM: Number(n.measure_m) });
    mesures.set(n.reserve_id as string, liste);
  }
  const releves = new Map<string, Releve[]>();
  for (const l of lectures) {
    const liste = releves.get(l.meter_id as string) ?? [];
    liste.push({ tsMs: Date.parse(l.ts as string), volumeM3: Number(l.volume_m3) });
    releves.set(l.meter_id as string, liste);
  }

  for (const site of avecReserves) {
    const reglages = lireReglagesAutonomie(plateforme, site.reglagesOrganisation);
    const duSite = reserves.filter((r) => r.siteId === site.id);
    const arrivees = inlets.filter((m) => m.site_id === site.id).map((m) => m.id as string);
    const coupuresSite: CoupureSite[] = ((coupures ?? []) as Ligne[])
      .filter((c) => c.site_id === site.id)
      .map((c) => ({
        id: c.id as string,
        debutMs: Date.parse(c.started_at as string),
        finMs: c.ended_at ? Date.parse(c.ended_at as string) : null,
        autonomieMinH: c.min_autonomy_h === null ? null : Number(c.min_autonomy_h),
      }));
    const enCours = coupuresSite.find((c) => c.finMs === null) ?? null;
    const etat = analyserAutonomie({
      fuseau: site.timezone,
      maintenantMs,
      reglages,
      reserves: duSite.map((r) => ({ reserve: r, mesures: mesures.get(r.id) ?? [] })),
      arrivees: arrivees.length ? arrivees.map((id) => releves.get(id) ?? []) : null,
      coupureEnCours: enCours ? { id: enCours.id, debutMs: enCours.debutMs } : null,
    });
    resultat.set(site.id, {
      siteId: site.id,
      reserves: duSite,
      compteursArrivee: arrivees,
      etat,
      coupures: coupuresSite,
      reglages,
    });
  }
  return resultat;
}
