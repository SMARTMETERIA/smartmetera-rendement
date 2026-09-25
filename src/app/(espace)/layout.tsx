import Link from "next/link";
import { getContexteUtilisateur } from "@/lib/auth/contexte";
import { NOM_PLATEFORME } from "@/lib/marque";
import { LogoutButton } from "@/components/LogoutButton";

/**
 * Espaces de l'offre Immeuble (partenaire, gestionnaire, occupant) et
 * compte personnel. Navigation selon le profil ; la marque blanche
 * complète (logo, couleurs) arrive en phase 6.
 */
export default async function EspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getContexteUtilisateur();
  const liens: { href: string; label: string }[] = [];
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
    ctx.adhesionsClient[0]?.organizationName ??
    NOM_PLATEFORME;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="text-lg font-semibold tracking-tight">{nom}</span>
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
    </div>
  );
}
