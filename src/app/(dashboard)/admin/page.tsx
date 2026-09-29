import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteUtilisateur } from "@/lib/auth/contexte";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrganisationsPanel } from "@/components/admin/OrganisationsPanel";
import { ImporterFicheCollecte } from "@/components/admin/ImporterFicheCollecte";
import { InviterUtilisateur } from "@/components/admin/InviterUtilisateur";
import { ModelesSourcesPanel } from "@/components/admin/ModelesSourcesPanel";
import { ChecklistActivation } from "@/components/admin/ChecklistActivation";
import { JournalAudit } from "@/components/admin/JournalAudit";
import { ReceptionCapteurs } from "@/components/admin/ReceptionCapteurs";
import { TachesPanel, type Tache } from "@/components/admin/TachesPanel";
import { PilotesPanel, type PiloteSuivi } from "@/components/admin/PilotesPanel";
import { UsagePanel, type LigneUsageAdmin } from "@/components/admin/UsagePanel";
import { Badge } from "@/components/ui/badge";

const dateCourte = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" }).format(new Date(iso));

export default async function AdminPage() {
  const ctx = await getContexteUtilisateur();
  if (!ctx.isPlatformAdmin) {
    redirect("/accueil");
  }

  const supabase = await createClient();
  const precedent = new Date();
  precedent.setUTCDate(1);
  precedent.setUTCMonth(precedent.getUTCMonth() - 1);
  const moisFacture = precedent.toISOString().slice(0, 7) + "-01";

  const [
    { data: organisations },
    { data: modeles },
    { data: sourcesEmail },
    { data: checklistItems },
    { data: checklistSuivi },
    { data: audit },
    { data: reception },
    { data: inconnues },
    { data: taches },
    { data: pilotes },
    { data: sitesGardien },
    { data: usage },
    { data: appareils },
    { data: muets },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "id, nom, kind, status, trial_ends_at, lineaire_reseau_km, nb_abonnes, zone_repartition_eaux, prix_m3_eur, created_at",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("import_templates")
      .select("id, nom, is_system, organization_id")
      .order("nom"),
    supabase
      .from("sources")
      .select(
        "id, nom, organization_id, default_template_id, organizations(nom)",
      )
      .eq("type", "email_entrant")
      .order("nom"),
    supabase
      .from("checklist_activation_items")
      .select("id, jour, ordre, titre, description")
      .order("jour")
      .order("ordre"),
    supabase
      .from("checklist_activation_suivi")
      .select("organization_id, item_id, fait, fait_le"),
    supabase
      .from("audit_log")
      .select(
        "id, organization_id, user_id, action, entite, entite_id, created_at, organizations(nom)",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "reception")
      .maybeSingle(),
    supabase
      .from("unknown_frames")
      .select("id, received_at, channel, device_ref")
      .order("received_at", { ascending: false })
      .limit(20),
    supabase
      .from("admin_tasks")
      .select("id, kind, status, due_at, created_at, details, organizations(nom)")
      .order("status")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("pilots")
      .select("id, started_at, ends_at, status, anomalies_found, consent_at, consent_by_name, setup_refund_if_nothing_found, next_action, sites(name), organizations(nom)")
      .order("started_at", { ascending: false })
      .limit(100),
    supabase.from("sites").select("id, name, organizations!inner(kind)").eq("organizations.kind", "sites").order("name"),
    supabase
      .from("usage_monthly")
      .select("id, currency, active_points, setup_points, temperature_points, amount_ht, withholding_tax_amount, details, organizations(nom)")
      .eq("period", moisFacture),
    supabase
      .from("devices")
      .select("id, device_ref, model, provisioning_status, battery_pct, battery_low, last_seen_at, organizations!inner(nom, kind)")
      .eq("organizations.kind", "sites")
      .neq("provisioning_status", "retire")
      .limit(2000),
    supabase.from("alerts").select("donnees").eq("type", "compteur_muet").in("statut", ["ouverte", "acquittee"]).not("site_id", "is", null),
  ]);
  const nom = (o: unknown) => ((Array.isArray(o) ? o[0] : o) as { nom?: string; name?: string } | null);
  const maintenant = new Date().getTime();
  const listePilotes: PiloteSuivi[] = (pilotes ?? []).map((p) => ({
    id: p.id,
    site: nom(p.sites)?.name ?? "—",
    organisation: nom(p.organizations)?.nom ?? "—",
    debut: dateCourte(p.started_at),
    fin: dateCourte(p.ends_at),
    joursRestants: Math.max(0, Math.ceil((Date.parse(p.ends_at) - maintenant) / 86_400_000)),
    statut: p.status,
    anomalies: p.anomalies_found,
    consentement: p.consent_at ? `${p.consent_by_name}, ${dateCourte(p.consent_at)}` : null,
    remboursement: p.setup_refund_if_nothing_found,
    prochaineAction: p.next_action ?? "",
  }));
  const lignesUsage: LigneUsageAdmin[] = (usage ?? []).map((u) => {
    const d = (u.details ?? {}) as Record<string, unknown>;
    return {
      id: u.id,
      organisation: nom(u.organizations)?.nom ?? "—",
      monnaie: u.currency,
      pointsActifs: u.active_points,
      misesEnService: u.setup_points,
      sondes: u.temperature_points,
      ht: Number(u.amount_ht),
      retenue: Number(u.withholding_tax_amount),
      net: Number(d.net ?? u.amount_ht),
      incomplet: d.incomplet === true,
    };
  });
  const idsMuets = new Set((muets ?? []).map((m) => (m.donnees as { device_id?: string } | null)?.device_id));
  const flotte = appareils ?? [];
  const aSurveiller = flotte.filter(
    (a) => idsMuets.has(a.id) || a.battery_low || (a.battery_pct !== null && Number(a.battery_pct) < 20),
  );
  const parEtat = (etat: string) => flotte.filter((a) => a.provisioning_status === etat).length;
  const listeTaches: Tache[] = (taches ?? []).map((t) => {
    const org = Array.isArray(t.organizations) ? t.organizations[0] : t.organizations;
    return {
      id: t.id,
      kind: t.kind,
      status: t.status,
      due_at: t.due_at,
      created_at: t.created_at,
      details: (t.details ?? {}) as Record<string, unknown>,
      organisation: (org as { nom?: string } | null)?.nom ?? "—",
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Espace superadmin
        </h1>
        <p className="text-muted-foreground text-sm">
          Onboarding client : organisations, fiche de collecte, invitations,
          modèles de sources, checklist d&apos;activation J0-J5, journal
          d&apos;audit.
        </p>
      </div>

      <Tabs defaultValue="organisations">
        <TabsList>
          <TabsTrigger value="organisations">Organisations</TabsTrigger>
          <TabsTrigger value="fiche">Fiche de collecte</TabsTrigger>
          <TabsTrigger value="utilisateurs">Utilisateurs</TabsTrigger>
          <TabsTrigger value="modeles">Modèles de sources</TabsTrigger>
          <TabsTrigger value="checklist">Checklist J0-J5</TabsTrigger>
          <TabsTrigger value="audit">Journal d&apos;audit</TabsTrigger>
          <TabsTrigger value="reception">Réception des capteurs</TabsTrigger>
          <TabsTrigger value="taches">
            Tâches ({listeTaches.filter((t) => t.status === "a_faire").length})
          </TabsTrigger>
          <TabsTrigger value="pilotes">Pilotes</TabsTrigger>
          <TabsTrigger value="usage">Usage mensuel</TabsTrigger>
          <TabsTrigger value="flotte">Flotte</TabsTrigger>
        </TabsList>

        <TabsContent value="pilotes" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Suivi des pilotes</CardTitle>
              <CardDescription>
                Pilotes en cours, jours restants, anomalies trouvées, accord
                écrit de conversion et prochaine action.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PilotesPanel
                pilotes={listePilotes}
                sites={(sitesGardien ?? []).map((s) => ({ id: s.id, name: s.name }))}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Usage mensuel et facturation</CardTitle>
              <CardDescription>
                Mises en service, abonnements, sondes, remise fondateur et
                retenue à la source, en euros et en dirhams. Pas de paiement en
                ligne : l&apos;export sert à facturer à la main.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UsagePanel mois={moisFacture.slice(0, 7)} lignes={lignesUsage} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="flotte" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Flotte</CardTitle>
              <CardDescription>
                {parEtat("en_stock")} en stock · {parEtat("attribue")} attribués · {parEtat("pose")} posés en
                attente · {parEtat("actif")} actifs. À surveiller : capteurs muets et piles faibles.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {aSurveiller.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucun appareil à surveiller.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {aSurveiller.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                      <span>
                        <span className="font-mono">{a.device_ref}</span> — {a.model ?? "—"} ({nom(a.organizations)?.nom})
                      </span>
                      <span className="flex gap-2">
                        {idsMuets.has(a.id) && <Badge variant="destructive">Muet</Badge>}
                        {(a.battery_low || (a.battery_pct !== null && Number(a.battery_pct) < 20)) && (
                          <Badge variant="secondary">Pile faible</Badge>
                        )}
                        <span className="text-muted-foreground">
                          {a.last_seen_at ? `dernier message ${dateCourte(a.last_seen_at)}` : "aucun message"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="taches" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Tâches</CardTitle>
              <CardDescription>
                Pilotes à convertir par téléphone (sans consentement écrit),
                remboursements prévus, clients qui n&apos;ouvrent plus leurs
                rapports.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TachesPanel taches={listeTaches} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reception" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Réception des capteurs</CardTitle>
              <CardDescription>
                Gardien de l&apos;eau : adresses du broker MQTT (kit A) et du
                serveur LoRaWAN (kit C, sondes).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReceptionCapteurs
                supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
                jetons={
                  (reception?.value ?? null) as {
                    jeton_mqtt?: string;
                    jeton_lorawan?: string;
                  } | null
                }
                inconnues={inconnues ?? []}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="organisations" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Organisations</CardTitle>
              <CardDescription>
                Toutes les organisations (régies et partenaires). Exporter
                télécharge toutes leurs données ; la suppression exige un export
                de moins de 24 heures.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OrganisationsPanel organisations={organisations ?? []} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fiche" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Fiche de collecte</CardTitle>
              <CardDescription>
                Modèle Excel (Service, Secteurs, Compteurs, Sources) — import en
                un clic pour peupler une organisation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImporterFicheCollecte organisations={organisations ?? []} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="utilisateurs" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Inviter un utilisateur</CardTitle>
              <CardDescription>
                Envoie un lien de connexion (Resend) et l&apos;ajoute à
                l&apos;organisation choisie.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InviterUtilisateur organisations={organisations ?? []} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modeles" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>
                Modèles assignés aux sources (boîte mail entrante)
              </CardTitle>
              <CardDescription>
                Chaque source email_entrant a besoin d&apos;un modèle de mapping
                par défaut pour importer automatiquement.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ModelesSourcesPanel
                sources={sourcesEmail ?? []}
                modeles={modeles ?? []}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checklist" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Checklist d&apos;activation</CardTitle>
              <CardDescription>
                Parcours d&apos;onboarding standard, J0 à J5.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChecklistActivation
                organisations={organisations ?? []}
                items={checklistItems ?? []}
                suivi={checklistSuivi ?? []}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Journal d&apos;audit</CardTitle>
              <CardDescription>
                50 dernières actions sur les organisations et adhésions
                (automatique, non modifiable).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JournalAudit entrees={audit ?? []} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
