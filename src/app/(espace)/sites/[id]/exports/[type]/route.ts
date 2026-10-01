import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { construirePdfVue } from "@/lib/gardien/rapportPdf";
import { limiterDebit } from "@/lib/securite/protection";
import { marqueOrganisation } from "@/lib/gardien/marqueOrganisation";
import {
  csvClefVerte,
  vueBreeam,
  vueClefVerte,
  vueRegistreTemperatures,
  type LigneRegistre,
  type MoisClefVerte,
} from "@/lib/gardien/exports";
import { indicateurActivite } from "@/lib/moteur-gardien/activite";
import { REGLAGES_DEFAUT, fusionnerReglages } from "@/lib/moteur-gardien/reglages";
import { dateLocale, decalerJour } from "@/lib/moteur-gardien/temps";
import type { TypeFuite } from "@/lib/moteur-gardien/analyse";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TYPES = ["registre", "clef-verte", "clef-verte-csv", "breeam"];

function pdf(octets: Uint8Array, nom: string) {
  return new Response(Buffer.from(octets), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nom}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

function moisPrecedents(aujourdhui: string, n: number): string[] {
  const d = new Date(`${aujourdhui.slice(0, 7)}-15T12:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(d);
    x.setUTCMonth(d.getUTCMonth() - (n - 1 - i));
    return x.toISOString().slice(0, 7);
  });
}

/** Exports du registre eau d'un site (RLS : sites visibles par l'utilisateur). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; type: string }> }) {
  const { id, type } = await params;
  const supabase = await createClient();
  const { data: utilisateur } = await supabase.auth.getUser();
  if (!utilisateur.user) return NextResponse.json({ erreur: "Connectez-vous." }, { status: 401 });
  if (!UUID.test(id) || !TYPES.includes(type)) return NextResponse.json({ erreur: "Export inconnu." }, { status: 404 });
  const limite = await limiterDebit(`pdf:user:${utilisateur.user.id}`);
  if (limite) return limite;
  const { data: site } = await supabase
    .from("sites")
    .select("id, organization_id, name, timezone, capacity, occupancy_rate_default, activity_unit")
    .eq("id", id)
    .maybeSingle();
  if (!site) return NextResponse.json({ erreur: "Site introuvable." }, { status: 404 });
  const marque = await marqueOrganisation(supabase, site.organization_id);
  const aujourdhui = dateLocale(Date.now(), site.timezone);

  if (type === "registre") {
    const annee = new URL(request.url).searchParams.get("annee") ?? aujourdhui.slice(0, 4);
    if (!/^\d{4}$/.test(annee)) return NextResponse.json({ erreur: "Année invalide." }, { status: 400 });
    const periode = { debut: `${annee}-01-01`, fin: `${annee}-12-31` < aujourdhui ? `${annee}-12-31` : aujourdhui };
    const { data } = await supabase.rpc("registre_temperatures", {
      p_site_id: id,
      p_debut: periode.debut,
      p_fin: periode.fin,
    });
    const vue = vueRegistreTemperatures({ nom: site.name, fuseau: site.timezone }, periode, (data ?? []) as LigneRegistre[]);
    return pdf(await construirePdfVue(vue, marque), `registre-temperatures-${annee}`);
  }

  if (type === "clef-verte" || type === "clef-verte-csv") {
    const mois = moisPrecedents(aujourdhui, 12);
    const { data: compteurs } = await supabase.from("meters").select("id").eq("site_id", id).eq("type", "point_comptage");
    const ids = (compteurs ?? []).map((m) => m.id);
    const [{ data: jours }, { data: activite }] = await Promise.all([
      ids.length
        ? supabase.from("meter_days").select("day, volume_m3").in("meter_id", ids).gte("day", `${mois[0]}-01`).limit(10000)
        : Promise.resolve({ data: [] as { day: string; volume_m3: number }[] }),
      supabase.from("activity_data").select("date, period, quantity").eq("site_id", id).gte("date", `${mois[0]}-01`),
    ]);
    const lignes: MoisClefVerte[] = mois.map((m) => {
      const volumeM3 =
        Math.round((jours ?? []).filter((j) => j.day.startsWith(m)).reduce((s, j) => s + Number(j.volume_m3), 0) * 1000) / 1000;
      const saisies = (activite ?? []).filter((a) => a.date.startsWith(m));
      const mensuelle = saisies.find((a) => a.period === "mois");
      const quantite = mensuelle
        ? Number(mensuelle.quantity)
        : saisies.length
          ? saisies.reduce((s, a) => s + Number(a.quantity), 0)
          : null;
      const joursDansMois = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
      const indicateur = volumeM3
        ? indicateurActivite({
            volumeM3,
            quantiteSaisie: quantite,
            capacite: site.capacity,
            tauxOccupation: site.occupancy_rate_default == null ? null : Number(site.occupancy_rate_default),
            joursDansMois,
            unite: "nuitee",
          })
        : null;
      return {
        mois: m,
        volumeM3,
        nuitees: indicateur ? indicateur.quantite : quantite,
        estimation: indicateur?.estimation ?? false,
        litresParNuitee: indicateur?.litresParUnite ?? null,
      };
    });
    if (type === "clef-verte-csv") {
      return new Response(`﻿${csvClefVerte({ nom: site.name }, lignes)}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="clef-verte.csv"',
          "Cache-Control": "no-store",
        },
      });
    }
    return pdf(await construirePdfVue(vueClefVerte({ nom: site.name }, lignes), marque), "clef-verte");
  }

  // Fiche BREEAM Wat 03 : règles réellement appliquées par le moteur.
  const admin = createAdminClient();
  const [{ data: compteurs }, { data: fuites }, { data: reglages }, { data: org }] = await Promise.all([
    supabase.from("meters").select("zone, transmission").eq("site_id", id).eq("type", "point_comptage").eq("actif", true),
    supabase
      .from("leak_events")
      .select("type, status, detected_at, excess_flow_lph, meters(zone)")
      .eq("site_id", id)
      .gte("detected_at", `${decalerJour(aujourdhui, -365)}T00:00:00Z`)
      .order("detected_at", { ascending: false }),
    admin.from("platform_settings").select("key, value").in("key", ["seuils", "alertes"]),
    admin.from("organizations").select("settings").eq("id", site.organization_id).maybeSingle(),
  ]);
  const valeur = (cle: string) => ((reglages ?? []).find((r) => r.key === cle)?.value ?? null) as Record<string, unknown> | null;
  const gardien = ((org?.settings ?? {}) as Record<string, unknown>).gardien as Record<string, unknown> | undefined;
  const regles = fusionnerReglages(
    fusionnerReglages(REGLAGES_DEFAUT, valeur("seuils")),
    (gardien?.seuils ?? null) as Record<string, unknown> | null,
  );
  const alertes = valeur("alertes") ?? {};
  const vue = vueBreeam(
    { nom: site.name, fuseau: site.timezone },
    {
      points: (compteurs ?? []).map((c) => ({ zone: c.zone, transmission: c.transmission })),
      reglages: regles,
      alertes: (fuites ?? []).map((f) => {
        const m = Array.isArray(f.meters) ? f.meters[0] : f.meters;
        return {
          type: f.type as TypeFuite,
          zone: (m as { zone?: string | null } | null)?.zone ?? null,
          detecteeLe: f.detected_at,
          statut: f.status,
          excesLph: Number(f.excess_flow_lph),
        };
      }),
      appelH: Number(alertes.escalade_appel_h ?? 2),
      directeurH: Number(alertes.escalade_directeur_h ?? 12),
    },
  );
  return pdf(await construirePdfVue(vue, marque), "breeam-wat-03");
}
