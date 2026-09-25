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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { AvisJournalDev } from "./AvisJournalDev";

type Statut = "repos" | "envoi" | "envoye" | "erreur";

export function FormulaireConnexion({
  message,
  journalDev,
  slug,
}: {
  message: string | null;
  journalDev: boolean;
  /** Page de connexion à la marque d'un partenaire (/p/[slug]). */
  slug?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [statut, setStatut] = useState<Statut>("repos");
  const [erreur, setErreur] = useState<string | null>(null);

  async function connexionMotDePasse(e: React.FormEvent) {
    e.preventDefault();
    setStatut("envoi");
    setErreur(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: motDePasse,
    });
    if (error) {
      setStatut("erreur");
      setErreur(
        error.code === "email_not_confirmed"
          ? "Confirmez d'abord votre adresse : cliquez sur le lien reçu par e-mail, ou demandez un lien de connexion."
          : "Adresse ou mot de passe incorrect.",
      );
      return;
    }
    router.push("/accueil");
    router.refresh();
  }

  async function demanderLien(e: React.FormEvent) {
    e.preventDefault();
    setStatut("envoi");
    setErreur(null);
    const reponse = await fetch("/api/auth/lien", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, slug }),
    });
    if (!reponse.ok) {
      const corps = (await reponse.json().catch(() => ({}))) as {
        erreur?: string;
      };
      setStatut("erreur");
      setErreur(corps.erreur ?? "Une erreur est survenue. Réessayez.");
      return;
    }
    setStatut("envoye");
  }

  async function connexionGoogle() {
    setErreur(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/accueil`,
      },
    });
    if (error) {
      setStatut("erreur");
      setErreur(
        "La connexion avec Google n'est pas encore disponible. Utilisez votre adresse e-mail.",
      );
    }
  }

  const champEmail = (
    <div className="space-y-2">
      <Label htmlFor="email">Adresse e-mail</Label>
      <Input
        id="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
    </div>
  );

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Connexion</CardTitle>
        <CardDescription>
          Avec votre mot de passe, ou avec un lien reçu par e-mail.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <Alert>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {erreur && (
          <Alert variant="destructive">
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}

        {statut === "envoye" ? (
          <div className="space-y-3">
            <p className="text-sm">
              Si un compte existe pour {email}, un lien de connexion vient de
              lui être envoyé. Ouvrez-le depuis cet appareil.
            </p>
            <AvisJournalDev visible={journalDev} />
            <Button variant="outline" className="w-full" onClick={() => setStatut("repos")}>
              Revenir à la connexion
            </Button>
          </div>
        ) : (
          <Tabs defaultValue={slug ? "lien" : "mot-de-passe"}>
            <TabsList className="w-full">
              <TabsTrigger value="mot-de-passe">Mot de passe</TabsTrigger>
              <TabsTrigger value="lien">Lien par e-mail</TabsTrigger>
            </TabsList>

            <TabsContent value="mot-de-passe" className="pt-4">
              <form onSubmit={connexionMotDePasse} className="space-y-4">
                {champEmail}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="mot-de-passe">Mot de passe</Label>
                    <Link
                      href="/mot-de-passe-oublie"
                      className="text-muted-foreground text-sm underline underline-offset-4"
                    >
                      Mot de passe oublié ?
                    </Link>
                  </div>
                  <Input
                    id="mot-de-passe"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={motDePasse}
                    onChange={(e) => setMotDePasse(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={statut === "envoi"}>
                  {statut === "envoi" ? "Connexion…" : "Se connecter"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="lien" className="pt-4">
              <form onSubmit={demanderLien} className="space-y-4">
                {champEmail}
                <Button type="submit" className="w-full" disabled={statut === "envoi"}>
                  {statut === "envoi" ? "Envoi…" : "Recevoir un lien de connexion"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        )}

        {!slug && statut !== "envoye" && (
          <>
            <div className="text-muted-foreground flex items-center gap-3 text-xs">
              <span className="bg-border h-px flex-1" />
              ou
              <span className="bg-border h-px flex-1" />
            </div>
            <Button variant="outline" className="w-full" onClick={connexionGoogle}>
              Continuer avec Google
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
