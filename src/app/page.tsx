import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">
        SmartMeteria Rendement
      </h1>
      <p className="text-muted-foreground max-w-xl">
        Bilan d&apos;eau continu, rendement de réseau et localisation des fuites
        par secteur pour les services d&apos;eau potable.
      </p>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">Démarrage</CardTitle>
        </CardHeader>
        <CardContent>
          <Link href="/connexion" className={cn(buttonVariants(), "w-full")}>
            Se connecter
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
