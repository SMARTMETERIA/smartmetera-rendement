import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEspaceLecture, peutAgirFuite } from "@/lib/auth/espaces";
import { FuitesEnCours, type FuiteAffichee } from "@/components/sites/FuitesEnCours";
import {
  LIBELLES_STATUT_FUITE,
  LIBELLES_TYPE_FUITE,
  MENTION_SURVEILLANCE,
  formaterMontant,
  formaterVolume,
} from "@/lib/gardien/fuites";
import { formaterDateHeure } from "@/lib/gardien/format";
import type { StatutFuite, TypeFuite } from "@/lib/moteur-gardien/analyse";
import type { Monnaie } from "@/lib/moteur-gardien/economies";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Ligne = Record<string, unknown>;
const un = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** Fiche d'une fuite : ouverte par le lien de l'alerte (« Je m'en occupe »). */
export default async function FuitePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getEspaceLecture();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: f } = await supabase
    .from("leak_events")
    .select(
      "id, site_id, type, status, detected_at, repaired_at, excess_flow_lph, currency, details, saved_m3, saved_amount, method, sites(name, water_price_per_m3, timezone), meters(zone, nom)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!f) notFound();
  const site = un(f.sites as Ligne | Ligne[] | null);
  const compteur = un(f.meters as Ligne | Ligne[] | null);
  const details = (f.details ?? {}) as Ligne;
  const fuseau = (site?.timezone as string | undefined) ?? "Europe/Paris";
  const monnaie: Monnaie = f.currency === "MAD" ? "MAD" : "EUR";
  const statut = f.status as StatutFuite;
  const zone = (compteur?.zone as string | null) ?? (compteur?.nom as string | null) ?? null;

  const affichee: FuiteAffichee = {
    id: f.id,
    site: (site?.name as string | undefined) ?? "Site",
    zone,
    type: f.type as TypeFuite,
    status: statut,
    detectedAt: f.detected_at,
    excesLph: Number(f.excess_flow_lph),
    prixM3: site?.water_price_per_m3 == null ? null : Number(site.water_price_per_m3),
    monnaie,
    fuseau,
    explication: typeof details.explication === "string" ? details.explication : null,
    simulation: details.simulation === true,
    peutAgir: peutAgirFuite(ctx, f.site_id),
  };

  return (
    <div className="space-y-6">
      <Link href="/sites" className="text-muted-foreground text-sm hover:underline">
        ← Mes sites
      </Link>
      {statut === "ouverte" || statut === "prise_en_compte" ? (
        <FuitesEnCours fuites={[affichee]} rendueA={new Date().getTime()} />
      ) : (
        <div className="space-y-3 rounded-lg border p-4">
          <h1 className="text-xl font-semibold">
            {LIBELLES_TYPE_FUITE[affichee.type]} — {affichee.site}
            {zone ? `, ${zone}` : ""}
          </h1>
          <p>
            {LIBELLES_STATUT_FUITE[statut]}
            {f.repaired_at ? ` le ${formaterDateHeure(f.repaired_at, fuseau)}` : ""}.
          </p>
          {statut === "reparee" && f.saved_m3 !== null && (
            <p className="text-lg font-semibold">
              Économies :{" "}
              {f.saved_amount !== null
                ? `${formaterMontant(Number(f.saved_amount), monnaie)} (${formaterVolume(Number(f.saved_m3))})`
                : formaterVolume(Number(f.saved_m3))}
            </p>
          )}
          {f.method && <p className="text-muted-foreground text-sm">{f.method}</p>}
        </div>
      )}
      <p className="text-muted-foreground text-xs">{MENTION_SURVEILLANCE}</p>
    </div>
  );
}
