import Link from "next/link";
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

  const nom =
    ctx.adhesion?.organizationName ??
    ctx.adhesionsSite[0]?.organizationName ??
    ctx.adhesionsClient[0]?.organizationName ??
    NOM_PLATEFORME;
  const orgMarque = organisationDeMarque(ctx);
  const chargee = orgMarque ? await marqueOrganisation(await createClient(), orgMarque) : MARQUE_PLATEFORME;
  // Client direct sans marque : identité SmartMeteria, avec son propre nom en tête.
  const marque = chargee === MARQUE_PLATEFORME ? { ...MARQUE_PLATEFORME, nom } : chargee;

  return (
    <EnveloppeMarque marque={marque} className="flex min-h-screen flex-col">
      <header className="bg-background border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <EnteteMarque marque={marque} />
          <LogoutButton />
        </div>
        <nav className="mx-auto flex max-w-5xl flex-wrap gap-1 px-4 pb-2 sm:px-6">
          {liens.map((lien) => (
            <Link
              key={lien.href}
              href={lien.href}
              className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            >
              {lien.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
      {marque.afficherPropulse && orgMarque && (
        <footer className="text-muted-foreground mx-auto w-full max-w-5xl px-4 pb-6 text-xs sm:px-6">
          {marque.piedDePage ? `${marque.piedDePage} · ` : ""}Propulsé par {NOM_PLATEFORME}
        </footer>
      )}
    </EnveloppeMarque>
  );
}
