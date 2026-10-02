import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEspaceSites, peutAgirFuite } from "@/lib/auth/espaces";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FuitesEnCours, type FuiteAffichee } from "@/components/sites/FuitesEnCours";
import { MENTION_SURVEILLANCE } from "@/lib/gardien/fuites";
import { formaterDateHeure } from "@/lib/gardien/format";
import type { StatutFuite, TypeFuite } from "@/lib/moteur-gardien/analyse";
import { monnaieDe } from "@/lib/moteur-gardien/economies";

type Ligne = Record<string, unknown>;
const un = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const TYPES: Record<string, string> = {
  compteur_muet: "Capteur muet",
  temperature_basse: "Température basse",
  rappel_analyses: "Analyses avant réouverture",
  coupure_reseau: "Coupure du réseau",
  reserve_basse: "Réserves basses",
};

const ORDRE_TYPES = ["coupure_reseau", "reserve_basse", "temperature_basse", "rappel_analyses", "compteur_muet"];

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
      .in("type", [...(equipe ? ["compteur_muet"] : []), "temperature_basse", "rappel_analyses", "coupure_reseau", "reserve_basse"])
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
      monnaie: monnaieDe(f.currency),
      fuseau: (site?.timezone as string | undefined) ?? "Europe/Paris",
      explication: typeof details.explication === "string" ? details.explication : null,
      simulation: details.simulation === true,
      peutAgir: peutAgirFuite(ctx, f.site_id as string),
    };
  });

  // Regroupées par site (plusieurs sites ont souvent les mêmes zones :
  // « Cuisine », « Chambres »), les plus importantes d'abord.
  const autres = ((alertes ?? []) as Ligne[])
    .map((a) => {
      const site = un(a.sites as Ligne | Ligne[] | null);
      const type = a.type as string;
      const titre = a.titre as string;
      const prefixe = `${TYPES[type] ?? ""} : `;
      return {
        id: a.id as string,
        siteId: a.site_id as string,
        site: (site?.name as string | undefined) ?? "Site",
        fuseau: (site?.timezone as string | undefined) ?? "Europe/Paris",
        type,
        titre: titre.startsWith(prefixe) ? titre.slice(prefixe.length) : titre,
        description: a.description as string,
        depuis: a.declenchee_le as string,
      };
    })
    .sort(
      (a, b) =>
        a.site.localeCompare(b.site, "fr") ||
        ORDRE_TYPES.indexOf(a.type) - ORDRE_TYPES.indexOf(b.type) ||
        a.titre.localeCompare(b.titre, "fr"),
    );
  const parSite = [...new Set(autres.map((a) => a.siteId))].map((siteId) => autres.filter((a) => a.siteId === siteId));
  const muets = autres.filter((a) => a.type === "compteur_muet").length;

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
            <p className="text-sm">
              {muets > 0
                ? `Aucune fuite repérée. Attention : ${muets > 1 ? `${muets} capteurs ne transmettent plus` : "1 capteur ne transmet plus"}, aucune fuite ne peut y être repérée tant que les données manquent (voir ci-dessous).`
                : "Votre eau est sous surveillance jour et nuit."}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Autres alertes</CardTitle>
        </CardHeader>
        <CardContent>
          {autres.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune alerte en cours.</p>
          ) : (
            <div className="space-y-4">
              {parSite.map((liste) => (
                <section key={liste[0].siteId} className="space-y-2">
                  <h3 className="text-sm font-semibold">
                    <Link href={`/sites/${liste[0].siteId}`} className="text-primary underline-offset-4 hover:underline">
                      {liste[0].site}
                    </Link>
                  </h3>
                  <ul className="divide-y rounded-lg border">
                    {liste.map((a) => (
                      <li key={a.id} className="space-y-1 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={a.type === "compteur_muet" ? "secondary" : "destructive"}>
                            {TYPES[a.type] ?? a.type}
                          </Badge>
                          <span className="font-medium">{a.titre}</span>
                        </div>
                        <p className="text-muted-foreground">
                          {a.description} Depuis le {formaterDateHeure(a.depuis, a.fuseau)}.
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
