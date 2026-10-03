import { getContexteUtilisateur } from "@/lib/auth/contexte";
import {
  estAdminSites,
  peutGererAppareils,
  peutPoser,
} from "@/lib/auth/espaces";
import { MARQUE_PLATEFORME, NOM_PLATEFORME } from "@/lib/marque";
import { createClient } from "@/lib/supabase/server";
import { marqueOrganisation, organisationDeMarque } from "@/lib/gardien/marqueOrganisation";
import { EnteteMarque, EnveloppeMarque } from "@/components/marque/EnveloppeMarque";
import { peutPrediagnostic } from "@/lib/gardien/prediagnosticServeur";
import { LogoutButton } from "@/components/LogoutButton";
import { PiedLegal } from "@/components/legal/PiedLegal";
import { NavEspace } from "@/components/NavEspace";

/**
 * Espaces Gardien de l'eau (sites), Immeuble (partenaire, gestionnaire,
 * occupant) et compte personnel. Navigation selon l'offre et le profil ;
 * logo, couleurs et pied de page à la marque de l'organisation.
 */
export default async function EspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getContexteUtilisateur();
  const liens: { href: string; label: string }[] = [];
  if (ctx.adhesion?.kind === "sites" || ctx.adhesionsSite.length > 0) {
    liens.push({ href: "/sites", label: "Mes sites" });
    liens.push({ href: "/sites/alertes", label: "Alertes" });
    liens.push({ href: "/sites/reserves", label: "Réserves d'eau" });
    if (peutPoser(ctx)) {
      liens.push({ href: "/pose", label: "Poser un capteur" });
    }
    if (peutGererAppareils(ctx)) {
      liens.push({ href: "/sites/appareils", label: "Appareils" });
      liens.push({ href: "/sites/envois", label: "Journal des envois" });
    }
    if (estAdminSites(ctx)) {
      liens.push({ href: "/sites/equipe", label: "Équipe" });
    }
    if (ctx.adhesion?.kind === "sites" && ctx.adhesion.role === "admin_client") {
      liens.push({ href: "/sites/marque", label: "Ma marque" });
    }
  }
  if (peutPrediagnostic(ctx)) {
    liens.push({ href: "/prediagnostic", label: "Pré-diagnostic" });
  }
  if (ctx.adhesion?.kind === "immeuble") {
    liens.push(
      { href: "/immeuble", label: "Accueil" },
      { href: "/immeuble/equipe", label: "Équipe et clients" },
    );
  }
  if (ctx.adhesion?.kind === "reseau") {
    liens.push({ href: "/app", label: "Tableau de bord" });
  }
  if (ctx.adhesionsClient.length > 0) {
    liens.push({ href: "/gestion", label: "Mes immeubles" });
  }
  if (ctx.estOccupant) {
    liens.push({ href: "/mon-logement", label: "Mon logement" });
  }
  if (ctx.isPlatformAdmin) {
    liens.push({ href: "/admin", label: "Superadmin" });
  }
  liens.push({ href: "/compte", label: "Mon compte" });

  const nomOrganisation =
    ctx.adhesion?.organizationName ??
    ctx.adhesionsSite[0]?.organizationName ??
    ctx.adhesionsClient[0]?.organizationName ??
    null;
  const orgMarque = organisationDeMarque(ctx);
  const marque = orgMarque ? await marqueOrganisation(await createClient(), orgMarque) : MARQUE_PLATEFORME;
  // Client direct sans marque : « Gardien de l'eau by SmartMeteria » en tête,
  // avec le nom de son organisation dessous.
  const sousTitre = marque === MARQUE_PLATEFORME ? nomOrganisation : null;

  return (
    <EnveloppeMarque marque={marque} className="flex min-h-screen flex-col">
      <header className="bg-background border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <EnteteMarque marque={marque} />
            {sousTitre && <p className="text-muted-foreground truncate text-xs">{sousTitre}</p>}
          </div>
          <LogoutButton />
        </div>
        <NavEspace liens={liens} />
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
      <footer className="text-muted-foreground mx-auto w-full max-w-5xl space-y-2 px-4 pb-6 text-center text-xs sm:px-6">
        {marque.afficherPropulse && orgMarque && (
          <p>
            {marque.piedDePage ? `${marque.piedDePage} · ` : ""}Propulsé par {NOM_PLATEFORME}
          </p>
        )}
        <PiedLegal />
      </footer>
    </EnveloppeMarque>
  );
}
