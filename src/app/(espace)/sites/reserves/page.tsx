import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEspaceSites } from "@/lib/auth/espaces";
import type { ContexteUtilisateur } from "@/lib/auth/destination";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MENTION_SURVEILLANCE } from "@/lib/gardien/fuites";
import { CLASSES_CARTE, CLASSES_TON } from "@/lib/gardien/etatSurveillance";
import { LIBELLES_TYPE_RESERVE, vueAutonomie, type TypeReserve } from "@/lib/gardien/reserves";
import { chargerAutonomie, type AutonomieSite } from "@/lib/gardien/autonomieServeur";
import { referenceCourte } from "@/lib/gardien/etiquettes";
import { dureeLisible, instantLisible } from "@/lib/moteur-gardien/autonomie";
import { formaterDateHeure } from "@/lib/gardien/format";
import { CompteAReboursAutonomie } from "@/components/sites/reserves/CompteAReboursAutonomie";
import { CourbeReserves } from "@/components/sites/reserves/CourbeReserves";
import { FormulaireReserve } from "@/components/sites/reserves/FormulaireReserve";
import { ArriveesReseau } from "@/components/sites/reserves/ArriveesReseau";

type Ligne = Record<string, unknown>;
const fr = (n: number, d = 1) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d }).format(n);

/** Réglage des réserves : administrateur, agent ou technicien (comme en base). */
function peutRegler(ctx: ContexteUtilisateur, siteId: string): boolean {
  return (
    ctx.isPlatformAdmin ||
    (ctx.adhesion?.kind === "sites" && ["admin_client", "agent", "technicien"].includes(ctx.adhesion.role)) ||
    ctx.adhesionsSite.some((a) => a.siteId === siteId && a.role === "technicien")
  );
}

/**
 * Réserves d'eau (phase G11), d'abord pour le téléphone : pour chaque site,
 * l'état du réseau public, l'autonomie qui baisse en direct, l'heure prévue
 * du niveau bas, le niveau de chaque réserve, la courbe de 48 heures et
 * les coupures récentes. Réglages des réserves pour l'équipe.
 */
export default async function ReservesPage() {
  const ctx = await getEspaceSites();
  const supabase = await createClient();
  const maintenant = new Date().getTime();
  const { data: lignesSites } = await supabase
    .from("sites")
    .select("id, name, city, timezone, organization_id")
    .eq("active", true)
    .order("name");
  const sites = (lignesSites ?? []) as { id: string; name: string; city: string | null; timezone: string; organization_id: string }[];
  const { data: organisations } = await supabase
    .from("organizations")
    .select("id, settings")
    .in("id", [...new Set(sites.map((s) => s.organization_id))]);
  const reglagesOrg = new Map(
    ((organisations ?? []) as Ligne[]).map((o) => [o.id as string, ((o.settings as Ligne | null)?.gardien as Ligne | undefined)?.autonomie]),
  );
  const autonomies = await chargerAutonomie(
    supabase,
    sites.map((s) => ({ id: s.id, timezone: s.timezone, reglagesOrganisation: reglagesOrg.get(s.organization_id) })),
    maintenant,
  );

  const reglables = sites.filter((s) => peutRegler(ctx, s.id));
  const [{ data: compteurs }, { data: capteurs }] = reglables.length
    ? await Promise.all([
        supabase
          .from("meters")
          .select("id, site_id, zone, nom, public_inlet")
          .in("site_id", reglables.map((s) => s.id))
          .eq("type", "point_comptage")
          .eq("actif", true)
          .order("zone"),
        supabase
          .from("devices")
          .select("id, device_ref, model, site_id")
          .eq("kit", "niveau")
          .neq("provisioning_status", "retire")
          .order("device_ref"),
      ])
    : [{ data: [] }, { data: [] }];
  const capteursNiveau = ((capteurs ?? []) as Ligne[]).map((c) => ({
    id: c.id as string,
    siteId: (c.site_id as string | null) ?? null,
    libelle: `${(c.model as string | null) ?? "Capteur de niveau"} ${referenceCourte(c.device_ref as string)}`,
  }));
  const reservesUtilisees = new Set(
    [...autonomies.values()].flatMap((a) => a.reserves.map((r) => r.deviceId)).filter((v): v is string => !!v),
  );
  const capteursPour = (siteId: string, actuel: string | null) =>
    capteursNiveau.filter((c) => (c.siteId === null || c.siteId === siteId) && (!reservesUtilisees.has(c.id) || c.id === actuel));

  const avec = sites.filter((s) => autonomies.has(s.id));
  const sans = sites.filter((s) => !autonomies.has(s.id));

  const reglages = (site: (typeof sites)[number], a: AutonomieSite | null) => (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">Régler les réserves de ce site</summary>
      <div className="mt-4 space-y-6">
        <ArriveesReseau
          siteId={site.id}
          compteurs={((compteurs ?? []) as Ligne[])
            .filter((m) => m.site_id === site.id)
            .map((m) => ({
              id: m.id as string,
              libelle: (m.zone as string | null) ?? (m.nom as string),
              arrivee: m.public_inlet === true,
            }))}
        />
        {(a?.reserves ?? []).map((r) => (
          <section key={r.id} className="space-y-2 border-t pt-4">
            <h4 className="text-sm font-semibold">{r.nom}</h4>
            <FormulaireReserve
              siteId={site.id}
              reserve={{
                id: r.id,
                nom: r.nom,
                kind: r.kind,
                capaciteM3: r.capaciteM3,
                forme: r.forme,
                hauteurPleineM: r.hauteurPleineM,
                hauteurPriseM: r.hauteurPriseM,
                montage: r.montage,
                hauteurCapteurM: r.hauteurCapteurM,
                seuilBasPct: r.seuilBasPct,
                deviceId: r.deviceId,
              }}
              capteurs={capteursPour(site.id, r.deviceId)}
              seuilDefautPct={a?.reglages.seuilBasPct ?? 20}
            />
          </section>
        ))}
        <section className="space-y-2 border-t pt-4">
          <h4 className="text-sm font-semibold">Ajouter une réserve</h4>
          <FormulaireReserve
            siteId={site.id}
            reserve={null}
            capteurs={capteursPour(site.id, null)}
            seuilDefautPct={a?.reglages.seuilBasPct ?? 20}
          />
        </section>
      </div>
    </details>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Réserves d&apos;eau</h1>
        <p className="text-muted-foreground text-sm">
          Combien de temps vos réserves tiennent si l&apos;eau du réseau public est coupée, au rythme de
          consommation réel. {MENTION_SURVEILLANCE}
        </p>
      </div>

      {avec.length === 0 && (
        <Card>
          <CardContent className="text-sm">
            Aucune réserve d&apos;eau suivie pour l&apos;instant. Posez un capteur de niveau sur une citerne, puis
            ajoutez la réserve ci-dessous (dimensions de la cuve et hauteur du capteur).
          </CardContent>
        </Card>
      )}

      {avec.map((site) => {
        const a = autonomies.get(site.id) as AutonomieSite;
        const e = a.etat;
        const enCours = a.coupures.find((c) => c.finMs === null) ?? null;
        const debutCoupure = enCours?.debutMs ?? e.nouvelleCoupure?.debutMs ?? null;
        const vue = vueAutonomie({
          etat: e,
          fuseau: site.timezone,
          maintenantMs: maintenant,
          coupureDebutMs: debutCoupure,
          compteurArrivee: a.compteursArrivee.length > 0,
        });
        const passees = a.coupures.filter((c) => c.finMs !== null).slice(0, 5);
        return (
          <Card key={site.id} id={`site-${site.id}`} className={CLASSES_CARTE[vue.arrivee.ton === "danger" ? "danger" : vue.tonChiffre]}>
            <CardHeader>
              <CardTitle>
                <Link href={`/sites/${site.id}`} className="hover:underline">
                  {site.name}
                </Link>
              </CardTitle>
              {site.city && <CardDescription>{site.city}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <p className={cn("text-lg font-semibold", CLASSES_TON[vue.arrivee.ton])}>{vue.arrivee.titre}</p>
                    {vue.arrivee.detail && <p className="text-muted-foreground text-sm">{vue.arrivee.detail}</p>}
                  </div>
                  <div>
                    <CompteAReboursAutonomie
                      videMs={e.heureVideMs}
                      rendueA={maintenant}
                      texteFixe={vue.chiffre}
                      className={CLASSES_TON[vue.tonChiffre]}
                    />
                    <p className="text-sm">{vue.libelleChiffre}</p>
                  </div>
                  <ul className="space-y-1 text-sm">
                    {vue.lignes.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </div>
                <ul className="space-y-4">
                  {e.reserves.map((r) => {
                    const sous = r.pct !== null && r.pct < r.seuilBasPct;
                    const reserve = a.reserves.find((x) => x.id === r.id);
                    return (
                      <li key={r.id} className="space-y-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                          <span className="font-medium">
                            {r.nom}
                            {reserve && (
                              <span className="text-muted-foreground font-normal">
                                {" "}
                                ({LIBELLES_TYPE_RESERVE[reserve.kind as TypeReserve] ?? reserve.kind})
                              </span>
                            )}
                          </span>
                          <span className="tabular-nums">
                            {r.volumeUtileM3 === null ? "niveau inconnu" : `${fr(r.volumeUtileM3)} m³ · ${fr(r.pct ?? 0, 0)} %`}
                          </span>
                        </div>
                        <div
                          role="meter"
                          aria-label={`Niveau de ${r.nom}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={r.pct ?? 0}
                          className="bg-muted h-3 w-full overflow-hidden rounded-full"
                        >
                          <div
                            className={cn("h-full rounded-full", sous ? "bg-destructive" : "bg-primary")}
                            style={{ width: `${Math.min(100, Math.max(0, r.pct ?? 0))}%` }}
                          />
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {fr(r.volumeUtileMaxM3)} m³ utilisables quand elle est pleine · niveau bas {fr(r.seuilBasPct, 0)} %
                          {r.derniereMesureMs ? ` · mesure du ${formaterDateHeure(new Date(r.derniereMesureMs).toISOString(), site.timezone)}` : ""}
                        </p>
                        {r.muette && <Badge variant="destructive">Le capteur ne transmet plus</Badge>}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <CourbeReserves
                mesures={e.courbe.map((c) => ({ t: c.tMs, volume: c.volumeM3 }))}
                prevision={e.prevision.map((p) => ({ t: p.tMs, prevision: p.volumeM3 }))}
                niveauBasM3={e.seuilBasM3}
                fuseau={site.timezone}
              />

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Coupures du réseau public</h3>
                {!enCours && passees.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Aucune coupure enregistrée.</p>
                ) : (
                  <ul className="divide-y rounded-lg border text-sm">
                    {enCours && (
                      <li className="p-3">
                        <span className="text-destructive font-medium">En cours</span> depuis{" "}
                        {instantLisible(enCours.debutMs, site.timezone, maintenant).replace(/^à /, "")} (
                        {dureeLisible((maintenant - enCours.debutMs) / 3_600_000)})
                      </li>
                    )}
                    {passees.map((c) => (
                      <li key={c.id} className="p-3">
                        Du {formaterDateHeure(new Date(c.debutMs).toISOString(), site.timezone)} au{" "}
                        {formaterDateHeure(new Date(c.finMs as number).toISOString(), site.timezone)} :{" "}
                        {dureeLisible(((c.finMs as number) - c.debutMs) / 3_600_000)}
                        {c.autonomieMinH !== null && (
                          <span className="text-muted-foreground">, autonomie la plus basse {dureeLisible(c.autonomieMinH)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {e.raisons.length > 0 && (
                <ul className="text-muted-foreground space-y-1 text-xs">
                  {e.raisons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
              {peutRegler(ctx, site.id) && reglages(site, a)}
            </CardContent>
          </Card>
        );
      })}

      {sans.length > 0 && reglables.some((s) => sans.includes(s)) && (
        <Card>
          <CardHeader>
            <CardTitle>Sites sans réserve suivie</CardTitle>
            <CardDescription>Ajoutez une réserve pour suivre son autonomie et repérer les coupures.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sans
              .filter((s) => peutRegler(ctx, s.id))
              .map((site) => (
                <section key={site.id} className="space-y-2">
                  <h3 className="text-sm font-semibold">{site.name}</h3>
                  {reglages(site, null)}
                </section>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
