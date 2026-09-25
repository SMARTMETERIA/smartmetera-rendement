"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";
import { erreurMotDePasse } from "@/lib/auth/validation";
import {
  demanderChangementAdresse,
  supprimerMonCompte,
} from "@/app/(espace)/compte/actions";
import { AvisJournalDev } from "./AvisJournalDev";

type Retour = { type: "ok" | "erreur"; texte: string } | null;

function Message({ retour }: { retour: Retour }) {
  if (!retour) return null;
  return (
    <Alert variant={retour.type === "erreur" ? "destructive" : "default"}>
      <AlertDescription>{retour.texte}</AlertDescription>
    </Alert>
  );
}

export function ChangerAdresse({ journalDev }: { journalDev: boolean }) {
  const [adresse, setAdresse] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<Retour>(null);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setRetour(null);
    const resultat = await demanderChangementAdresse(adresse);
    setEnCours(false);
    setRetour(
      "erreur" in resultat
        ? { type: "erreur", texte: resultat.erreur }
        : { type: "ok", texte: resultat.message },
    );
  }

  return (
    <form onSubmit={envoyer} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nouvelle-adresse">Nouvelle adresse</Label>
        <Input
          id="nouvelle-adresse"
          type="email"
          autoComplete="email"
          required
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
        />
      </div>
      <Message retour={retour} />
      {retour?.type === "ok" && <AvisJournalDev visible={journalDev} />}
      <Button type="submit" variant="outline" disabled={enCours}>
        {enCours ? "Envoi…" : "Changer d'adresse"}
      </Button>
    </form>
  );
}

export function ChangerMotDePasse() {
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<Retour>(null);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    const probleme =
      erreurMotDePasse(motDePasse) ??
      (motDePasse !== confirmation
        ? "Les deux mots de passe ne sont pas identiques."
        : null);
    if (probleme) {
      setRetour({ type: "erreur", texte: probleme });
      return;
    }
    setEnCours(true);
    const { error } = await createClient().auth.updateUser({ password: motDePasse });
    setEnCours(false);
    if (error) {
      setRetour({
        type: "erreur",
        texte:
          error.code === "same_password"
            ? "Choisissez un mot de passe différent de l'actuel."
            : "Enregistrement impossible. Déconnectez-vous puis reconnectez-vous, et réessayez.",
      });
      return;
    }
    setMotDePasse("");
    setConfirmation("");
    setRetour({ type: "ok", texte: "Mot de passe enregistré." });
  }

  return (
    <form onSubmit={enregistrer} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nouveau-mdp">Nouveau mot de passe</Label>
          <Input
            id="nouveau-mdp"
            type="password"
            autoComplete="new-password"
            required
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmation-mdp">Confirmation</Label>
          <Input
            id="confirmation-mdp"
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </div>
      </div>
      <Message retour={retour} />
      <Button type="submit" variant="outline" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer le mot de passe"}
      </Button>
    </form>
  );
}

export function SupprimerCompte() {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<Retour>(null);

  async function supprimer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    const resultat = await supprimerMonCompte(confirmation);
    setEnCours(false);
    if ("erreur" in resultat) {
      setRetour({ type: "erreur", texte: resultat.erreur });
      return;
    }
    router.push("/connexion?compte=supprime");
    router.refresh();
  }

  return (
    <form onSubmit={supprimer} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="confirmation-suppression">
          Tapez SUPPRIMER pour confirmer
        </Label>
        <Input
          id="confirmation-suppression"
          autoComplete="off"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
      </div>
      <Message retour={retour} />
      <Button type="submit" variant="destructive" disabled={enCours}>
        {enCours ? "Suppression…" : "Supprimer définitivement mon compte"}
      </Button>
    </form>
  );
}
