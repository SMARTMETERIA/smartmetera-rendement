import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NOM_PLATEFORME } from "@/lib/marque";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">
        {NOM_PLATEFORME} — Gardien de l&apos;eau
      </h1>
      <p className="text-muted-foreground max-w-xl">
        Le registre eau de votre établissement : fuites repérées la nuit et
        signalées par SMS et e-mail, températures d&apos;eau chaude, rapport
        mensuel avec les économies réalisées depuis le début.
      </p>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">Démarrer</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Link href="/connexion" className={cn(buttonVariants(), "w-full")}>
            Se connecter
          </Link>
          <Link
            href="/inscription"
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            Créer un compte (essai de 30 jours)
          </Link>
        </CardContent>
      </Card>
      <p className="text-muted-foreground max-w-md text-xs">
        Surveillance fondée sur les données transmises par les capteurs.
      </p>
    </main>
  );
}
