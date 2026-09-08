"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Destinataire {
  id: string;
  email: string;
  nom: string | null;
  actif: boolean;
}

export function RapportDestinataires({
  organizationId,
  destinataires,
  peutGerer,
}: {
  organizationId: string;
  destinataires: Destinataire[];
  peutGerer: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [nom, setNom] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();
    const { error } = await supabase.from("rapport_destinataires").insert({
      organization_id: organizationId,
      email,
      nom: nom || null,
    });
    setEnCours(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setEmail("");
    setNom("");
    router.refresh();
  }

  async function basculerActif(d: Destinataire) {
    const supabase = createClient();
    await supabase
      .from("rapport_destinataires")
      .update({ actif: !d.actif })
      .eq("id", d.id);
    router.refresh();
  }

  async function supprimer(id: string) {
    const supabase = createClient();
    await supabase.from("rapport_destinataires").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {destinataires.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun destinataire pour l&apos;instant.</p>
      ) : (
        <ul className="space-y-2">
          {destinataires.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5"
            >
              <div>
                <span className="font-medium">{d.email}</span>
                {d.nom && <span className="text-muted-foreground ml-2 text-sm">({d.nom})</span>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={d.actif ? "secondary" : "outline"}>
                  {d.actif ? "Actif" : "Inactif"}
                </Badge>
                {peutGerer && (
                  <>
                    <Button type="button" variant="outline" size="sm" onClick={() => basculerActif(d)}>
                      {d.actif ? "Désactiver" : "Activer"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => supprimer(d.id)}
                    >
                      Retirer
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {peutGerer && (
        <form onSubmit={ajouter} className="flex flex-wrap items-end gap-2">
          {erreur && (
            <Alert variant="destructive" className="w-full">
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1">
            <Label htmlFor="dest-email">E-mail</Label>
            <Input
              id="dest-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maire@commune.fr"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dest-nom">Nom (optionnel)</Label>
            <Input
              id="dest-nom"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Mairie de..."
            />
          </div>
          <Button type="submit" disabled={enCours}>
            {enCours ? "Ajout…" : "Ajouter"}
          </Button>
        </form>
      )}
    </div>
  );
}
