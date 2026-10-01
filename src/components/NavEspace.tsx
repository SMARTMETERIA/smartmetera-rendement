"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Lien actif : la page elle-même ou une de ses sous-pages (le lien le plus précis gagne). */
export function lienActif(chemin: string, liens: string[]): string | null {
  const candidats = liens.filter((href) => chemin === href || chemin.startsWith(`${href}/`));
  return candidats.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** Navigation des espaces, avec la page en cours mise en évidence. */
export function NavEspace({ liens }: { liens: { href: string; label: string }[] }) {
  const chemin = usePathname() ?? "";
  const actif = lienActif(
    chemin,
    liens.map((l) => l.href),
  );
  return (
    <nav
      aria-label="Navigation principale"
      className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2 whitespace-nowrap sm:flex-wrap sm:px-6"
    >
      {liens.map((lien) => (
        <Link
          key={lien.href}
          href={lien.href}
          aria-current={lien.href === actif ? "page" : undefined}
          className={cn(
            "text-muted-foreground hover:bg-muted hover:text-foreground rounded-md px-3 py-1.5 text-sm font-medium transition-colors pointer-coarse:py-2.5",
            lien.href === actif && "bg-muted text-foreground",
          )}
        >
          {lien.label}
        </Link>
      ))}
    </nav>
  );
}
