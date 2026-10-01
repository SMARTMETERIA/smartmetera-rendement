import Link from "next/link";
import { cn } from "@/lib/utils";

const LIENS = [
  { href: "/legal/mentions-legales", libelle: "Mentions légales" },
  { href: "/legal/cgu", libelle: "Conditions d'utilisation" },
  { href: "/legal/confidentialite", libelle: "Confidentialité" },
];

/** Liens vers les pages légales, en bas des pages publiques et des espaces. */
export function PiedLegal({ className }: { className?: string }) {
  return (
    <nav aria-label="Informations légales" className={cn("text-muted-foreground text-xs", className)}>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {LIENS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="hover:text-foreground underline-offset-4 hover:underline">
              {l.libelle}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
