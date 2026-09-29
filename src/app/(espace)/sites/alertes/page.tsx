import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEspaceSites, peutAgirFuite } from "@/lib/auth/espaces";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FuitesEnCours, type FuiteAffichee } from "@/components/sites/FuitesEnCours";
import { MENTION_SURVEILLANCE } from "@/lib/gardien/fuites";
import { formaterDateHeure } from "@/lib/gardien/format";
import type { StatutFuite, TypeFuite } from "@/lib/moteur-gardien/analyse";

type Ligne = Record<string, unknown>;
const un = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const TYPES: Record<string, string> = {
  compteur_muet: "Capteur muet",
  temperature_basse: "Température basse",
  rappel_analyses: "Analyses avant réouverture",
};

/**
 * Alertes en cours sur les sites de la personne (technicien d'abord) :
 * fuites avec « Je m'en occupe », capteurs muets (équipe seulement, jamais
 * le directeur en premier), températures, rappels.
 */
export default async function AlertesPage() {
  const ctx = await getEspaceSites();
  const supabase = await createClient();
  const equipe = ctx.adhesion?.kind === "sites" || ctx.isPlatformAdmin;
  const [{ data: fuites }, { data: alertes }] = await Promise.all([
    supabase
      .from("leak_events")
      .select("id, site_id, type, status, detected_at, excess_flow_lph, currency, details, sites(name, water_price_per_m3, timezone), meters(zone, nom)")
      .in("status", ["ouverte", "prise_en_compte"])
      .order("detected_at", { ascending: false })
      .limit(100),
    supabase
      .from("alerts")
      .select("id, site_id, type, titre, description, declenchee_le, statut, sites(name, timezone)")
      .not("site_id", "is", null)
      .in("statut", ["ouverte", "acquittee"])
      .in("type", equipe ? ["compteur_muet", "temperature_basse", "rappel_analyses"] : ["temperature_basse", "rappel_analyses"])
      .order("declenchee_le", { ascending: false })
      .limit(100),
  ]);
  const affichees: FuiteAffichee[] = ((fuites ?? []) as Ligne[]).map((f) => {
    const site = un(f.sites as Ligne | Ligne[] | null);
    const compteur = un(f.meters as Ligne | Ligne[] | null);
    const details = (f.details ?? {}) as Ligne;
    return {
      id: f.id as string,
      site: (site?.name as string | undefined) ?? "Site",
      zone: (compteur?.zone as string | null) ?? (compteur?.nom as string | null) ?? null,
      type: f.type as TypeFuite,
      status: f.status as StatutFuite,
      detectedAt: f.detected_at as string,
      excesLph: Number(f.excess_flow_lph),
      prixM3: site?.water_price_per_m3 == null ? null : Number(site.water_price_per_m3),
      monnaie: f.currency === "MAD" ? "MAD" : "EUR",
      fuseau: (site?.timezone as string | undefined) ?? "Europe/Paris",
      explication: typeof details.explication === "string" ? details.explication : null,
      simulation: details.simulation === true,
      peutAgir: peutAgirFuite(ctx, f.site_id as string),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alertes</h1>
        <p className="text-muted-foreground text-sm">{MENTION_SURVEILLANCE}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{affichees.length === 0 ? "Aucune fuite en cours" : `Fuites en cours (${affichees.length})`}</CardTitle>
          <CardDescription>Cliquez « Je m&apos;en occupe » pour arrêter les relances.</CardDescription>
        </CardHeader>
        <CardContent>
          {affichees.length > 0 ? (
            <FuitesEnCours fuites={affichees} rendueA={new Date().getTime()} />
          ) : (
            <p className="text-sm">Votre eau est sous surveillance jour et nuit.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Autres alertes</CardTitle>
        </CardHeader>
        <CardContent>
          {(alertes ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune alerte en cours.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {((alertes ?? []) as Ligne[]).map((a) => {
                const site = un(a.sites as Ligne | Ligne[] | null);
                return (
                  <li key={a.id as string} className="space-y-1 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={a.type === "temperature_basse" ? "destructive" : "secondary"}>
                        {TYPES[a.type as string] ?? (a.type as string)}
                      </Badge>
                      <Link href={`/sites/${a.site_id}`} className="font-medium hover:underline">
                        {a.titre as string}
                      </Link>
                    </div>
                    <p className="text-muted-foreground">
                      {a.description as string} Depuis le{" "}
                      {formaterDateHeure(a.declenchee_le as string, (site?.timezone as string | undefined) ?? "Europe/Paris")}.
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
