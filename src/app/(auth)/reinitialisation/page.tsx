"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { erreurMotDePasse } from "@/lib/auth/validation";

/**
 * Arrivée depuis le lien « mot de passe oublié » : /auth/confirmer a déjà
 * ouvert une session de récupération, il reste à choisir le mot de passe.
 */
export default function ReinitialisationPage() {
  const router = useRouter();
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    const probleme =
      erreurMotDePasse(motDePasse) ??
      (motDePasse !== confirmation
        ? "Les deux mots de passe ne sont pas identiques."
        : null);
    if (probleme) {
      setErreur(probleme);
      return;
    }
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setEnCours(false);
      setErreur(
        "Ce lien a expiré. Refaites une demande depuis « Mot de passe oublié ».",
      );
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: motDePasse });
    setEnCours(false);
    if (error) {
      setErreur(
        error.code === "same_password"
          ? "Choisissez un mot de passe différent de l'ancien."
          : "Enregistrement impossible. Réessayez.",
      );
      return;
    }
    router.push("/accueil");
    router.refresh();
  }

  return (
    <>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Nouveau mot de passe</CardTitle>
          <CardDescription>Choisissez votre nouveau mot de passe.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={enregistrer} className="space-y-4">
            {erreur && (
              <Alert variant="destructive">
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="mot-de-passe">Nouveau mot de passe</Label>
              <Input
                id="mot-de-passe"
                type="password"
                autoComplete="new-password"
                required
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmation">Confirmez le mot de passe</Label>
              <Input
                id="confirmation"
                type="password"
                autoComplete="new-password"
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={enCours}>
              {enCours ? "Enregistrement…" : "Enregistrer et me connecter"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Link href="/mot-de-passe-oublie" className="text-muted-foreground text-sm underline underline-offset-4">
        Redemander un lien
      </Link>
    </>
  );
}
