import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEspaceSites, peutPoser } from "@/lib/auth/espaces";
import { normaliserReference } from "@/lib/ingest/reference";
import {
  MODELES_CAPTEURS,
  modeleDepuisDecodeur,
  trouverModele,
} from "@/lib/gardien/modeles";
import { referenceCourte } from "@/lib/gardien/etiquettes";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AssistantPose, type SitePose } from "@/components/pose/AssistantPose";

interface Appareil {
  id: string;
  organization_id: string;
  site_id: string | null;
  device_ref: string;
  model: string | null;
  decodeur: string | null;
  meter_id: string | null;
  provisioning_status: string;
}

const COLONNES =
  "id, organization_id, site_id, device_ref, model, decodeur, meter_id, provisioning_status";

function Introuvable({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-md space-y-4 text-center">
      <h1 className="text-2xl font-semibold">Capteur introuvable</h1>
      <p className="text-muted-foreground">{message}</p>
      <Link
        href="/pose"
        className={cn(buttonVariants(), "h-12 w-full text-base")}
      >
        Saisir un autre code
      </Link>
    </div>
  );
}

/** Assistant de pose ouvert par le QR code de l'étiquette (/pose/<code>). */
export default async function PoseCapteurPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const ctx = await getEspaceSites();
  if (!peutPoser(ctx)) redirect("/sites");
  const { code } = await params;
  const saisie = decodeURIComponent(code).trim();
  const supabase = await createClient();

  let appareil: Appareil | null = null;
  if (/^[A-Za-z0-9_-]{8,64}$/.test(saisie)) {
    const { data } = await supabase
      .from("devices")
      .select(COLONNES)
      .eq("qr_code", saisie.toUpperCase())
      .neq("provisioning_status", "retire")
      .maybeSingle();
    appareil = data as Appareil | null;
  }
  const reference = normaliserReference(saisie);
  if (!appareil && reference) {
    const { data } = await supabase
      .from("devices")
      .select(COLONNES)
      .eq("device_ref", reference)
      .neq("provisioning_status", "retire")
      .order("canal", { nullsFirst: true })
      .limit(1)
      .maybeSingle();
    appareil = data as Appareil | null;
  }
  if (!appareil) {
    return (
      <Introuvable message="Ce code ne correspond à aucun capteur de votre stock. Vérifiez la saisie, ou demandez à votre administrateur d'importer le capteur." />
    );
  }

  const cle =
    trouverModele(appareil.model ?? "") ??
    modeleDepuisDecodeur(appareil.decodeur);
  if (!cle) {
    return (
      <Introuvable message="Le modèle de ce capteur n'est pas reconnu : contactez le support." />
    );
  }
  const modele = MODELES_CAPTEURS[cle];

  // Sites où la pose est possible : celui du capteur s'il est attribué,
  // sinon ceux de l'organisation (technicien d'un site : ses sites).
  const techniciensSite = ctx.adhesionsSite
    .filter((a) => a.role === "technicien")
    .map((a) => a.siteId);
  const membreOrganisation =
    ctx.adhesion?.kind === "sites" &&
    ctx.adhesion.organizationId === appareil.organization_id;
  let requeteSites = supabase
    .from("sites")
    .select("id, name")
    .eq("organization_id", appareil.organization_id)
    .eq("active", true)
    .order("name");
  if (appareil.site_id) requeteSites = requeteSites.eq("id", appareil.site_id);
  else if (!membreOrganisation)
    requeteSites = requeteSites.in("id", techniciensSite);
  const { data: sites } = await requeteSites;
  const sitesPose = ((sites ?? []) as SitePose[]).filter(
    (s) => membreOrganisation || techniciensSite.includes(s.id),
  );
  if (sitesPose.length === 0) {
    return (
      <Introuvable message="Ce capteur est attribué à un site sur lequel vous n'intervenez pas." />
    );
  }

  let dejaPose: string | null = null;
  if (appareil.meter_id) {
    const { data: meter } = await supabase
      .from("meters")
      .select("zone, sites(name)")
      .eq("id", appareil.meter_id)
      .maybeSingle();
    const site = (meter?.sites as unknown as { name: string } | null)?.name;
    dejaPose =
      [site, meter?.zone].filter(Boolean).join(", ") ||
      "emplacement enregistré";
  }

  return (
    <AssistantPose
      organizationId={appareil.organization_id}
      sites={sitesPose}
      appareil={{
        id: appareil.id,
        reference: referenceCourte(appareil.device_ref),
        libelleModele: modele.libelle,
        nature: modele.nature,
        voies: modele.voies,
        consigne: modele.consigne,
        dejaPose,
      }}
    />
  );
}
