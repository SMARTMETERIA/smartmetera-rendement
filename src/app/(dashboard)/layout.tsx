import Link from "next/link";
import { redirect } from "next/navigation";
import { getContexteUtilisateur } from "@/lib/auth/contexte";
import { LogoutButton } from "@/components/LogoutButton";

const LIENS_NAV = [
  { href: "/app", label: "Vue d'ensemble" },
  { href: "/secteurs", label: "Secteurs" },
  { href: "/compteurs", label: "Compteurs" },
  { href: "/bilan", label: "Bilan" },
  { href: "/alertes", label: "Alertes" },
  { href: "/import", label: "Import" },
  { href: "/rapports", label: "Rapports" },
  { href: "/plan-actions", label: "Plan d'actions" },
  { href: "/roi", label: "ROI" },
  { href: "/parametres", label: "Paramètres" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getContexteUtilisateur();
  // Superadmin de plateforme sans adhésion : seul l'espace superadmin a un
  // sens (les pages Réseau le renvoient vers /admin).
  if (!ctx.adhesion && !ctx.isPlatformAdmin) {
    redirect("/accueil");
  }
  const reseau = ctx.adhesion?.kind === "reseau";
  const liens = [
    ...(reseau ? LIENS_NAV : []),
    ...(ctx.isPlatformAdmin ? [{ href: "/admin", label: "Superadmin" }] : []),
    { href: "/compte", label: "Mon compte" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print border-b bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold tracking-tight">
              SmartMeteria Rendement
            </span>
            {ctx.adhesion && (
              <span className="text-muted-foreground hidden text-sm sm:inline">
                — {ctx.adhesion.organizationName}
              </span>
            )}
          </div>
          <LogoutButton />
        </div>
        <nav className="mx-auto flex max-w-7xl flex-wrap gap-1 px-4 pb-2 sm:px-6">
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
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
