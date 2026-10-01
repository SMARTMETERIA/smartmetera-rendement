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
  formaterVolume,
  totalEconomies,
} from "@/lib/gardien/fuites";
import type { StatutFuite, TypeFuite } from "@/lib/moteur-gardien/analyse";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PagePreuveBouton } from "@/components/sites/PagePreuveBouton";
import { TITRES_RAPPORT, type TypeRapport } from "@/lib/gardien-rapports/contenus";
import { moisLong, montantRond as formaterMontantRond, nombre } from "@/lib/gardien-envois/format";
import { dernierMoisComplet, indicateursSites } from "@/lib/gardien/indicateursSites";
import { dateLocale } from "@/lib/moteur-gardien/temps";
import { CLASSES_CARTE, CLASSES_TON, etatSurveillance } from "@/lib/gardien/etatSurveillance";
import { cn } from "@/lib/utils";

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
  // Équipe de l'organisation : voit le détail des capteurs muets (comme la page « Alertes »).
  const equipe = adhesion !== null || ctx.isPlatformAdmin;

  let requeteSites = supabase
    .from("sites")
    .select("id, name, type, city, country, active, timezone, activity_unit, capacity, occupancy_rate_default, clients(name)")
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
  const [
    { data: fuitesBrutes },
    { data: reparees },
    { data: rapports },
    { data: alertesEnCours },
    { count: compteursPoses },
    { count: sondes },
  ] = await Promise.all([
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
    supabase
      .from("site_reports")
      .select("id, site_id, kind, period, opened_at")
      .in("site_id", siteIds)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("alerts")
      .select("site_id, type")
      .in("site_id", siteIds)
      .in("statut", ["ouverte", "acquittee"])
      .in("type", ["compteur_muet", "temperature_basse"]),
    supabase
      .from("meters")
      .select("id", { count: "exact", head: true })
      .in("site_id", siteIds)
      .eq("type", "point_comptage")
      .eq("actif", true)
      .not("installed_at", "is", null),
    supabase
      .from("temperature_points")
      .select("id", { count: "exact", head: true })
      .in("site_id", siteIds)
      .eq("active", true),
  ]);
  const nomSite = new Map((sites ?? []).map((s) => [s.id, s.name]));
  const aujourdhui = dateLocale(new Date().getTime(), REGLAGES_PAYS[org?.country === "MA" ? "MA" : "FR"].fuseau);
  const indicateurs = await indicateursSites(supabase, sites ?? [], aujourdhui, { equipe });
  const moisIndicateur = dernierMoisComplet(aujourdhui).debut;
  const avecClients = (sites ?? []).some((s) => un(s.clients as Ligne | Ligne[] | null));
  // Vue groupe : classement par litres par unité (le plus sobre en premier).
  const sitesTries = [...(sites ?? [])].sort((a, b) => {
    const la = indicateurs.get(a.id)?.litresParUnite ?? null;
    const lb = indicateurs.get(b.id)?.litresParUnite ?? null;
    if (la === null && lb === null) return a.name.localeCompare(b.name);
    if (la === null) return 1;
    if (lb === null) return -1;
    return la - lb;
  });
  const pointsActifs = peutAjouter ? (compteursPoses ?? 0) : null;
  const peutPreuve =
    peutAjouter || ctx.adhesionsSite.some((a) => a.role === "directeur_site");
  const sitesPreuve = (sites ?? [])
    .filter((s) => peutAjouter || ctx.adhesionsSite.some((a) => a.siteId === s.id && a.role === "directeur_site"))
    .map((s) => ({ id: s.id, name: s.name }));
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
  const etat = etatSurveillance({
    fuites: fuites.length,
    pointsPoses: (compteursPoses ?? 0) + (sondes ?? 0),
    capteursMuets: (alertesEnCours ?? []).filter((a) => a.type === "compteur_muet").length,
    temperaturesBasses: (alertesEnCours ?? []).filter((a) => a.type === "temperature_basse").length,
    equipe,
  });
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

      <section className="space-y-1" aria-label="Économies">
        <p className="text-muted-foreground text-sm">Économies depuis le début, tous sites</p>
        <p className="text-primary font-heading text-5xl font-semibold tabular-nums sm:text-6xl">
          {economies.length === 0
            ? formaterMontantRond(0, pays === "MA" ? "MAD" : "EUR")
            : economies
                .map((e) => (e.montant !== null ? formaterMontantRond(e.montant, e.monnaie) : formaterVolume(e.m3)))
                .join(" + ")}
        </p>
        <p className="text-muted-foreground text-xs">
          Méthode prudente : excès de débit × 24 h × délai de découverte évité × prix du m³ du site.
        </p>
      </section>

      <Card className={CLASSES_CARTE[etat.ton]}>
        <CardHeader>
          <CardTitle className={cn("text-xl", CLASSES_TON[etat.ton])}>{etat.titre}</CardTitle>
          <CardDescription>{MENTION_SURVEILLANCE}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {etat.lignes.map((l) => (
            <p key={l} className="text-sm">
              {l}
            </p>
          ))}
          {fuites.length > 0 && <FuitesEnCours fuites={fuites} rendueA={rendueA} />}
          {etat.titre === "Aucun capteur posé" && peutGererAppareils(ctx) && (
            <Link href="/sites/appareils" className="text-sm font-medium underline underline-offset-4">
              Ajouter des capteurs au stock, puis les poser
            </Link>
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
          <CardTitle>Rapports</CardTitle>
          <CardDescription>
            Première nuit, première semaine, chaque mois le 1er à 8 h, et fin
            de pilote. Aussi envoyés par e-mail.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(rapports ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Le premier rapport arrive le lendemain matin de la pose.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {(rapports ?? []).map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/rapports/${r.id}`}
                    className="hover:bg-muted flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                  >
                    <span>
                      <span className="font-medium">
                        {r.kind === "mensuel"
                          ? `Rapport de ${moisLong(r.period)}`
                          : TITRES_RAPPORT[r.kind as TypeRapport]}
                      </span>{" "}
                      — {nomSite.get(r.site_id)}
                    </span>
                    {!r.opened_at && <Badge variant="secondary">Nouveau</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {peutPreuve && <PagePreuveBouton sites={sitesPreuve} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sites</CardTitle>
          <CardDescription>
            {(sites ?? []).length > 1
              ? "Classés du plus sobre au plus consommateur (litres par nuitée, emplacement ou couvert du mois dernier). "
              : ""}
            Chaque site a son fuseau horaire et sa monnaie : la nuit, les
            alertes et les rapports suivent l&apos;heure locale.
            {pointsActifs != null &&
              ` Usage du mois : ${pointsActifs} ${pointsActifs > 1 ? "points de comptage actifs" : "point de comptage actif"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {(sites ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {peutAjouter
                ? "Aucun site pour l'instant. Ajoutez votre premier site ci-dessous."
                : "Aucun site ne vous est encore attribué. Demandez-le à l'administrateur de votre établissement."}
            </p>
          ) : (
            <>
              <ul className="divide-y rounded-lg border sm:hidden">
                {sitesTries.map((s) => {
                  const ind = indicateurs.get(s.id);
                  const client = un(s.clients as Ligne | Ligne[] | null);
                  return (
                    <li key={s.id}>
                      <Link href={`/sites/${s.id}`} className="hover:bg-muted flex items-start justify-between gap-3 p-3">
                        <span className="min-w-0 space-y-0.5">
                          <span className="text-primary block font-medium">
                            {s.name}
                            {!s.active && <span className="text-muted-foreground font-normal"> (désactivé)</span>}
                          </span>
                          <span className="text-muted-foreground block text-xs">
                            {[
                              (client?.name as string | undefined) ?? null,
                              LIBELLES_TYPE_SITE[s.type as TypeSite] ?? s.type,
                              s.city,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          {ind?.litresParUnite != null && ind.unite && (
                            <span className="block text-sm tabular-nums">
                              {`${nombre(ind.litresParUnite, 0)} L par ${ind.unite}${ind.estimation ? " (estimation)" : ""} en ${moisLong(moisIndicateur)}`}
                            </span>
                          )}
                        </span>
                        {ind?.alertes ? (
                          <Badge variant="destructive" aria-label={`Alertes en cours : ${ind.alertes}`}>
                            {ind.alertes}
                          </Badge>
                        ) : (
                          <span aria-hidden className="text-muted-foreground">
                            ›
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <Table className="hidden sm:table">
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  {avecClients && <TableHead>Client</TableHead>}
                  <TableHead>Type</TableHead>
                  <TableHead>Ville</TableHead>
                  <TableHead>Pays</TableHead>
                  <TableHead>Consommation {moisLong(moisIndicateur)}</TableHead>
                  <TableHead>Alertes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sitesTries.map((s) => {
                  const ind = indicateurs.get(s.id);
                  const client = un(s.clients as Ligne | Ligne[] | null);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        <Link href={`/sites/${s.id}`} className="text-primary underline-offset-4 hover:underline">
                          {s.name}
                        </Link>
                        {!s.active && (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            (désactivé)
                          </span>
                        )}
                      </TableCell>
                      {avecClients && <TableCell>{(client?.name as string | undefined) ?? "—"}</TableCell>}
                      <TableCell>
                        {LIBELLES_TYPE_SITE[s.type as TypeSite] ?? s.type}
                      </TableCell>
                      <TableCell>{s.city ?? "—"}</TableCell>
                      <TableCell>
                        {REGLAGES_PAYS[s.country as "FR" | "MA"]?.libelle ??
                          s.country}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {ind?.litresParUnite != null && ind.unite
                          ? `${nombre(ind.litresParUnite, 0)} L par ${ind.unite}${ind.estimation ? " (estimation)" : ""}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {ind?.alertes ? <Badge variant="destructive">{ind.alertes}</Badge> : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </>
          )}
          {peutAjouter && (
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold">Ajouter un site</h3>
              <NouveauSite paysParDefaut={pays} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
