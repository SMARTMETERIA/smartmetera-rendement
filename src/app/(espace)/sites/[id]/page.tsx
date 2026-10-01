import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEspaceLecture, peutAgirFuite } from "@/lib/auth/espaces";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FuitesEnCours, type FuiteAffichee } from "@/components/sites/FuitesEnCours";
import { CourbeSite } from "@/components/sites/CourbeSite";
import { ActiviteMois } from "@/components/sites/ActiviteMois";
import { ConsentementPilote } from "@/components/sites/ConsentementPilote";
import {
  LIBELLES_STATUT_FUITE,
  LIBELLES_TYPE_FUITE,
  MENTION_SURVEILLANCE,
  totalEconomies,
} from "@/lib/gardien/fuites";
import { formaterDateHeure } from "@/lib/gardien/format";
import { CLASSES_CARTE, CLASSES_TON, etatSurveillance } from "@/lib/gardien/etatSurveillance";
import { LIBELLES_TYPE_SITE, type TypeSite } from "@/lib/gardien/libelles";
import { UNITES_ACTIVITE, TITRES_RAPPORT, type TypeRapport } from "@/lib/gardien-rapports/contenus";
import { dateLongue, montant, montantRond, moisLong, nombre, quantite as accord, volume } from "@/lib/gardien-envois/format";
import { REGLAGES_DEFAUT } from "@/lib/moteur-gardien/reglages";
import { dateLocale, decalerJour, instantLocal } from "@/lib/moteur-gardien/temps";
import type { StatutFuite, TypeFuite } from "@/lib/moteur-gardien/analyse";
import type { Monnaie } from "@/lib/moteur-gardien/economies";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Ligne = Record<string, unknown>;
const un = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const TYPES_POINT: Record<string, string> = {
  sortie_production: "Sortie de production",
  retour_boucle: "Retour de boucle",
  point_eloigne: "Point éloigné",
};

/**
 * Espace d'un site (directeur, et toute personne qui voit le site) :
 * économies, état, compteur de pertes, courbe de 30 jours avec la bande de
 * nuit, fuites, points de comptage et de température, activité du mois,
 * pilote et exports du registre eau.
 */
export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getEspaceLecture();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id, organization_id, name, type, city, timezone, currency, water_price_per_m3, activity_unit, capacity, occupancy_rate_default")
    .eq("id", id)
    .maybeSingle();
  if (!site) notFound();
  if (ctx.isPlatformAdmin && ctx.adhesion?.organizationId !== site.organization_id) {
    await supabase.rpc("journaliser_consultation", { p_organization_id: site.organization_id, p_page: `/sites/${id}` });
  }

  const fuseau = site.timezone as string;
  const monnaie: Monnaie = site.currency === "MAD" ? "MAD" : "EUR";
  const maintenant = new Date().getTime();
  const aujourdhui = dateLocale(maintenant, fuseau);
  const moisCourant = aujourdhui.slice(0, 7);
  const moisPrecedent = decalerJour(`${moisCourant}-01`, -1).slice(0, 7);

  const [
    { data: fuites },
    { data: compteurs },
    { data: points },
    { data: courbe },
    { data: activite },
    { data: pilotes },
    { data: rapports },
    { data: alertesEnCours },
  ] = await Promise.all([
    supabase
      .from("leak_events")
      .select("id, type, status, detected_at, repaired_at, excess_flow_lph, saved_m3, saved_amount, currency, details, meters(zone, nom)")
      .eq("site_id", id)
      .order("detected_at", { ascending: false })
      .limit(30),
    supabase
      .from("meters")
      .select("id, nom, zone, surveillance, transmission, installed_at, devices(last_seen_at, battery_pct, provisioning_status)")
      .eq("site_id", id)
      .eq("type", "point_comptage")
      .eq("actif", true)
      .order("zone"),
    supabase.from("temperature_points").select("id, label, type, threshold_c").eq("site_id", id).eq("active", true),
    supabase.rpc("courbe_horaire_site", {
      p_site_id: id,
      p_debut: new Date(maintenant - 30 * 86_400_000).toISOString(),
      p_fin: new Date(maintenant).toISOString(),
    }),
    supabase
      .from("activity_data")
      .select("date, quantity")
      .eq("site_id", id)
      .eq("period", "mois")
      .in("date", [`${moisCourant}-01`, `${moisPrecedent}-01`]),
    supabase.rpc("pilotes_visibles"),
    supabase
      .from("site_reports")
      .select("id, kind, period, opened_at")
      .eq("site_id", id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("alerts")
      .select("type, donnees")
      .eq("site_id", id)
      .in("statut", ["ouverte", "acquittee"])
      .in("type", ["compteur_muet", "temperature_basse"]),
  ]);

  const toutes = (fuites ?? []) as Ligne[];
  const ouvertes = toutes.filter((f) => f.status === "ouverte" || f.status === "prise_en_compte");
  const economies = totalEconomies(
    toutes.filter((f) => f.status === "reparee") as { saved_m3: number; saved_amount: number | null; currency: string }[],
  );
  const eco = economies.find((e) => e.monnaie === monnaie);
  const prixM3 = site.water_price_per_m3 == null ? null : Number(site.water_price_per_m3);
  const affichees: FuiteAffichee[] = ouvertes.map((f) => {
    const compteur = un(f.meters as Ligne | Ligne[] | null);
    const details = (f.details ?? {}) as Ligne;
    return {
      id: f.id as string,
      site: site.name,
      zone: (compteur?.zone as string | null) ?? (compteur?.nom as string | null) ?? null,
      type: f.type as TypeFuite,
      status: f.status as StatutFuite,
      detectedAt: f.detected_at as string,
      excesLph: Number(f.excess_flow_lph),
      prixM3,
      monnaie,
      fuseau,
      explication: typeof details.explication === "string" ? details.explication : null,
      simulation: details.simulation === true,
      peutAgir: peutAgirFuite(ctx, id),
    };
  });

  // Températures : dernier relevé de chaque point.
  const derniers = await Promise.all(
    ((points ?? []) as Ligne[]).map(async (p) => {
      const { data } = await supabase
        .from("temperature_readings")
        .select("ts, value_c")
        .eq("point_id", p.id as string)
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { id: p.id as string, label: p.label as string, type: p.type as string, dernier: data };
    }),
  );

  const nuits = Array.from({ length: 32 }, (_, i) => {
    const date = decalerJour(aujourdhui, -i);
    return {
      debut: instantLocal(date, REGLAGES_DEFAUT.fuiteNuit.debutH, fuseau),
      fin: instantLocal(date, REGLAGES_DEFAUT.fuiteNuit.finH, fuseau),
    };
  });
  const pointsCourbe = ((courbe ?? []) as { heure: string; litres: number }[]).map((c) => ({
    t: Date.parse(c.heure),
    lph: Number(c.litres),
  }));
  const pilote = ((pilotes ?? []) as Ligne[]).find(
    (p) => p.site_id === id && (p.status === "en_cours" || p.status === "prolonge"),
  );
  const peutConsentir =
    ctx.isPlatformAdmin ||
    (ctx.adhesion?.kind === "sites" && ctx.adhesion.role === "admin_client" && ctx.adhesion.organizationId === site.organization_id) ||
    ctx.adhesionsSite.some((a) => a.siteId === id && a.role === "directeur_site");
  const peutSaisir =
    peutConsentir ||
    (ctx.adhesion?.kind === "sites" && ctx.adhesion.role === "agent" && ctx.adhesion.organizationId === site.organization_id);
  const unite = UNITES_ACTIVITE[site.activity_unit as string];
  const quantite = (mois: string) => {
    const l = (activite ?? []).find((a) => a.date === `${mois}-01`);
    return l ? Number(l.quantity) : null;
  };
  const annee = aujourdhui.slice(0, 4);

  // État honnête : capteurs muets (détail pour l'équipe), eau chaude sous le seuil.
  const equipe =
    ctx.isPlatformAdmin || (ctx.adhesion?.kind === "sites" && ctx.adhesion.organizationId === site.organization_id);
  const alertesOuvertes = (alertesEnCours ?? []) as { type: string; donnees: Ligne | null }[];
  const muets = new Set(
    alertesOuvertes
      .filter((a) => a.type === "compteur_muet")
      .flatMap((a) => [a.donnees?.meter_id, a.donnees?.point_id])
      .filter((v): v is string => typeof v === "string"),
  );
  const sousSeuil = new Set(
    alertesOuvertes
      .filter((a) => a.type === "temperature_basse")
      .map((a) => a.donnees?.point_id)
      .filter((v): v is string => typeof v === "string"),
  );
  const etat = etatSurveillance({
    fuites: ouvertes.length,
    pointsPoses:
      ((compteurs ?? []) as Ligne[]).filter((m) => m.installed_at).length + (points ?? []).length,
    capteursMuets: alertesOuvertes.filter((a) => a.type === "compteur_muet").length,
    temperaturesBasses: alertesOuvertes.filter((a) => a.type === "temperature_basse").length,
    equipe,
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/sites" className="text-muted-foreground text-sm hover:underline">
          ← Mes sites
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{site.name}</h1>
        <p className="text-muted-foreground text-sm">
          {LIBELLES_TYPE_SITE[site.type as TypeSite] ?? site.type}
          {site.city ? ` — ${site.city}` : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Économies depuis le début</CardDescription>
            <CardTitle className="text-primary font-heading text-5xl font-semibold tabular-nums">
              {eco?.montant != null ? montantRond(eco.montant, monnaie) : eco ? volume(eco.m3) : montantRond(0, monnaie)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Méthode prudente : excès de débit × 24 h × délai de découverte évité × prix du m³ du site.
          </CardContent>
        </Card>
        <Card className={CLASSES_CARTE[etat.ton]}>
          <CardHeader>
            <CardDescription>État</CardDescription>
            <CardTitle className={cn("text-2xl", CLASSES_TON[etat.ton])}>{etat.titre}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {etat.lignes
              .filter((l) => !l.startsWith("Votre eau est surveillée"))
              .map((l) => (
                <p key={l}>{l}</p>
              ))}
            <p className="text-muted-foreground text-xs">{MENTION_SURVEILLANCE}</p>
          </CardContent>
        </Card>
      </div>

      {affichees.length > 0 && <FuitesEnCours fuites={affichees} rendueA={maintenant} />}

      <Card>
        <CardHeader>
          <CardTitle>30 derniers jours</CardTitle>
        </CardHeader>
        <CardContent>
          <CourbeSite points={pointsCourbe} nuits={nuits} fuseau={fuseau} />
        </CardContent>
      </Card>

      {pilote && (
        <Card>
          <CardHeader>
            <CardTitle>Pilote en cours</CardTitle>
            <CardDescription>
              Jusqu&apos;au {dateLongue(dateLocale(Date.parse(pilote.ends_at as string), fuseau))} —{" "}
              {Math.max(0, Math.ceil((Date.parse(pilote.ends_at as string) - maintenant) / 86_400_000))} jours restants,{" "}
              {accord(Number(pilote.anomalies_found), "anomalie trouvée", "anomalies trouvées")}.
            </CardDescription>
          </CardHeader>
          {peutConsentir && (
            <CardContent>
              <ConsentementPilote
                piloteId={pilote.id as string}
                siteId={id}
                accorde={pilote.auto_convert_consent === true}
                accordeLe={pilote.consent_at ? formaterDateHeure(pilote.consent_at as string, fuseau) : null}
                accordePar={(pilote.consent_by_name as string | null) ?? null}
                fin={dateLongue(dateLocale(Date.parse(pilote.ends_at as string), fuseau))}
              />
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Points de comptage et de température</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(compteurs ?? []).length === 0 && (points ?? []).length === 0 && (
            <p className="text-muted-foreground text-sm">Aucun capteur posé sur ce site pour l&apos;instant.</p>
          )}
          <ul className="divide-y rounded-lg border">
            {((compteurs ?? []) as Ligne[]).map((m) => {
              const appareil = un(m.devices as Ligne | Ligne[] | null);
              return (
                <li key={m.id as string} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span className="font-medium">{(m.zone as string | null) ?? (m.nom as string)}</span>
                  <span className="text-muted-foreground">
                    {appareil?.last_seen_at
                      ? `dernier message le ${formaterDateHeure(appareil.last_seen_at as string, fuseau)}`
                      : "aucun message"}
                    {appareil?.battery_pct != null ? ` · pile ${nombre(Number(appareil.battery_pct), 0)} %` : ""}
                  </span>
                  {m.surveillance === "limitee" && <Badge variant="secondary">Surveillance limitée</Badge>}
                  {equipe && muets.has(m.id as string) && <Badge variant="destructive">Ne transmet plus</Badge>}
                </li>
              );
            })}
            {derniers.map((p) => (
              <li key={p.id as string} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span className="font-medium">
                  {p.label as string} <span className="text-muted-foreground font-normal">({TYPES_POINT[p.type as string]})</span>
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {p.dernier ? `${nombre(Number(p.dernier.value_c))} °C le ${formaterDateHeure(p.dernier.ts, fuseau)}` : "aucun relevé"}
                </span>
                {sousSeuil.has(p.id) && <Badge variant="destructive">Sous le seuil</Badge>}
                {equipe && muets.has(p.id) && <Badge variant="destructive">Ne transmet plus</Badge>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {unite && (
        <Card>
          <CardHeader>
            <CardTitle>Activité</CardTitle>
            <CardDescription>
              Pour calculer les litres par {unite} (rapport mensuel, Clef Verte). Sans saisie, une estimation
              est faite avec la capacité et le taux d&apos;occupation du site.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {peutSaisir ? (
              <>
                <ActiviteMois siteId={id} mois={moisPrecedent} libelleMois={moisLong(moisPrecedent)} unite={`${unite[0].toUpperCase()}${unite.slice(1)}s`} valeur={quantite(moisPrecedent)} />
                <ActiviteMois siteId={id} mois={moisCourant} libelleMois={moisLong(moisCourant)} unite={`${unite[0].toUpperCase()}${unite.slice(1)}s`} valeur={quantite(moisCourant)} />
              </>
            ) : (
              <p className="text-sm">
                {moisLong(moisPrecedent)} : {quantite(moisPrecedent) ?? "—"} · {moisLong(moisCourant)} : {quantite(moisCourant) ?? "—"}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Historique des fuites</CardTitle>
        </CardHeader>
        <CardContent>
          {toutes.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune fuite détectée sur ce site.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {toutes.map((f) => {
                const compteur = un(f.meters as Ligne | Ligne[] | null);
                return (
                  <li key={f.id as string}>
                    <Link href={`/fuites/${f.id}`} className="hover:bg-muted flex flex-wrap justify-between gap-2 p-3 text-sm">
                      <span>
                        <span className="font-medium">{LIBELLES_TYPE_FUITE[f.type as TypeFuite]}</span>
                        {compteur?.zone ? ` — ${compteur.zone}` : ""} · {formaterDateHeure(f.detected_at as string, fuseau)}
                      </span>
                      <span className="text-muted-foreground">
                        {LIBELLES_STATUT_FUITE[f.status as StatutFuite]}
                        {f.status === "reparee" && f.saved_amount != null
                          ? ` · ${montant(Number(f.saved_amount), monnaie)} économisés`
                          : ""}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rapports et registre eau</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(rapports ?? []).length > 0 && (
            <ul className="divide-y rounded-lg border">
              {(rapports ?? []).map((r) => (
                <li key={r.id}>
                  <Link href={`/rapports/${r.id}`} className="hover:bg-muted flex justify-between gap-2 p-3 text-sm">
                    <span>{r.kind === "mensuel" ? `Rapport de ${moisLong(r.period)}` : TITRES_RAPPORT[r.kind as TypeRapport]}</span>
                    {!r.opened_at && <Badge variant="secondary">Nouveau</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            {(points ?? []).length > 0 && (
              <a href={`/sites/${id}/exports/registre?annee=${annee}`} className={cn(buttonVariants({ variant: "outline" }))}>
                Registre des températures {annee} (PDF)
              </a>
            )}
            {site.activity_unit === "nuitee" && (
              <>
                <a href={`/sites/${id}/exports/clef-verte`} className={cn(buttonVariants({ variant: "outline" }))}>
                  Clef Verte (PDF)
                </a>
                <a href={`/sites/${id}/exports/clef-verte-csv`} className={cn(buttonVariants({ variant: "outline" }))}>
                  Clef Verte (tableur)
                </a>
              </>
            )}
            <a href={`/sites/${id}/exports/breeam`} className={cn(buttonVariants({ variant: "outline" }))}>
              Fiche BREEAM Wat 03 (PDF)
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
