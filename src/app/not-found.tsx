import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function PageIntrouvable() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Page introuvable</h1>
      <p className="text-muted-foreground">
        Cette adresse n&apos;existe pas ou n&apos;est plus valable. Si vous avez suivi un lien de
        partage, il a peut-être expiré.
      </p>
      <Link href="/accueil" className={buttonVariants({ className: "h-11" })}>
        Revenir à l&apos;accueil
      </Link>
    </main>
  );
}
