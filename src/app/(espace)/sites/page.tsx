import { createClient } from "@/lib/supabase/server";
import {
  getEspaceSites,
  organisationEspaceSites,
  peutAgirFuite,
  peutGererAppareils,
} from "@/lib/auth/espaces";
import { LIBELLES_TYPE_SITE, type TypeSite } from "@/lib/gardien/libelles";
import { REGLAGES_PAYS } from "@/lib/gardien/pays";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NouveauSite } from "@/components/sites/NouveauSite";
import { FuitesEnCours, type FuiteAffichee } from "@/components/sites/FuitesEnCours";
import { SimulerFuite } from "@/components/sites/SimulerFuite";
import {
  MENTION_SURVEILLANCE,
  formaterMontant,
  formaterVolume,
  totalEconomies,
} from "@/lib/gardien/fuites";
import type { StatutFuite, TypeFuite } from "@/lib/moteur-gardien/analyse";

type Ligne = Record<string, unknown>;
const un = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

/**
 * Espace Gardien de l'eau : les sites accessibles, les fuites en cours
 * avec leur compteur de pertes et les économies réalisées. Version
 * minimale ; le tableau de bord de chaque site arrive en phase G6.
 */
export default async function SitesPage() {
  const ctx = await getEspaceSites();
  const supabase = await createClient();
  const { organizationId, organizationName } = organisationEspaceSites(ctx);
  const adhesion = ctx.adhesion?.kind === "sites" ? ctx.adhesion : null;
  const peutAjouter =
    adhesion !== null && ["admin_client", "agent"].includes(adhesion.role);
  const simulation = process.env.NODE_ENV === "development" && peutGererAppareils(ctx);

  let requeteSites = supabase
    .from("sites")
    .select("id, name, type, city, country, active")
    .order("name");
  requeteSites = adhesion
    ? requeteSites.eq("organization_id", organizationId)
    : requeteSites.in(
        "id",
        ctx.adhesionsSite.map((a) => a.siteId),
      );

  const [{ data: sites }, { data: org }] = await Promise.all([
    requeteSites,
    supabase
      .from("organizations")
      .select("country, status, trial_ends_at")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);
  const siteIds = (sites ?? []).map((s) => s.id);
  const [{ data: fuitesBrutes }, { data: reparees }] = await Promise.all([
    supabase
      .from("leak_events")
      .select(
        "id, site_id, type, status, detected_at, excess_flow_lph, currency, details, sites(name, water_price_per_m3, timezone), meters(zone, nom)",
      )
      .in("site_id", siteIds)
      .in("status", ["ouverte", "prise_en_compte"])
      .order("detected_at", { ascending: false }),
    supabase
      .from("leak_events")
      .select("saved_m3, saved_amount, currency")
      .in("site_id", siteIds)
      .eq("status", "reparee"),
  ]);
  const fuites: FuiteAffichee[] = ((fuitesBrutes ?? []) as Ligne[]).map((f) => {
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
  const economies = totalEconomies(reparees ?? []);
  const rendueA = new Date().getTime();

  const pays = org?.country === "MA" ? "MA" : "FR";
  const finEssai =
    org?.status === "essai" && org.trial_ends_at
      ? new Intl.DateTimeFormat("fr-FR", {
          dateStyle: "long",
          timeZone: REGLAGES_PAYS[pays].fuseau,
        }).format(new Date(org.trial_ends_at))
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mes sites</h1>
        <p className="text-muted-foreground text-sm">
          {organizationName}
          {finEssai && ` — essai gratuit jusqu'au ${finEssai}`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {fuites.length === 0
              ? "Aucune fuite en cours"
              : fuites.length === 1
                ? "1 fuite en cours"
                : `${fuites.length} fuites en cours`}
          </CardTitle>
          <CardDescription>{MENTION_SURVEILLANCE}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {fuites.length === 0 ? (
            <p className="text-sm">
              Votre eau est sous surveillance jour et nuit.
            </p>
          ) : (
            <FuitesEnCours fuites={fuites} rendueA={rendueA} />
          )}
          {economies.length > 0 && (
            <p className="text-sm">
              Économies grâce aux fuites réparées :{" "}
              {economies
                .map((e) =>
                  e.montant !== null
                    ? `${formaterMontant(e.montant, e.monnaie)} (${formaterVolume(e.m3)})`
                    : formaterVolume(e.m3),
                )
                .join(" et ")}
              <span className="text-muted-foreground">
                {" "}
                — méthode prudente : excès de débit × 24 h × délai de
                découverte évité × prix du m³ du site.
              </span>
            </p>
          )}
          {simulation && (
            <SimulerFuite
              sites={(sites ?? []).map((s) => ({ id: s.id, name: s.name }))}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sites</CardTitle>
          <CardDescription>
            Chaque site a son fuseau horaire et sa monnaie : la nuit, les
            alertes et les rapports suivent l&apos;heure locale.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {peutAjouter && <NouveauSite paysParDefaut={pays} />}
          {(sites ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {peutAjouter
                ? "Aucun site pour l'instant. Ajoutez votre premier site ci-dessus."
                : "Aucun site ne vous est encore attribué."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Ville</TableHead>
                  <TableHead>Pays</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sites ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {s.name}
                      {!s.active && (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          (désactivé)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {LIBELLES_TYPE_SITE[s.type as TypeSite] ?? s.type}
                    </TableCell>
                    <TableCell>{s.city ?? "—"}</TableCell>
                    <TableCell>
                      {REGLAGES_PAYS[s.country as "FR" | "MA"]?.libelle ??
                        s.country}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
