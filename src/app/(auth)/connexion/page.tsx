"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

export default function ConnexionPage() {
  const [email, setEmail] = useState("");
  const [statut, setStatut] = useState<"repos" | "envoi" | "envoye" | "erreur">(
    "repos",
  );

  async function envoyerLienMagique(evenement: React.FormEvent) {
    evenement.preventDefault();
    setStatut("envoi");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setStatut(error ? "erreur" : "envoye");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Connexion</CardTitle>
          <CardDescription>
            Recevez un lien de connexion par e-mail, sans mot de passe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statut === "envoye" ? (
            <p className="text-muted-foreground text-sm">
              Un lien de connexion a été envoyé à {email}. Vérifiez votre boîte
              de réception.
            </p>
          ) : (
            <form onSubmit={envoyerLienMagique} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Adresse e-mail</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@regie-eau.fr"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={statut === "envoi"}
              >
                {statut === "envoi" ? "Envoi en cours..." : "Recevoir le lien"}
              </Button>
              {statut === "erreur" && (
                <p className="text-destructive text-sm">
                  Une erreur est survenue. Réessayez.
                </p>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
