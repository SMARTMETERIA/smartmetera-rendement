"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inviterMembre } from "@/app/(espace)/immeuble/equipe/actions";

const ROLES = [
  { value: "agent", label: "Agent (imports, envois)" },
  { value: "lecteur", label: "Lecteur (consultation)" },
  { value: "admin_client", label: "Administrateur" },
  { value: "gestionnaire", label: "Gestionnaire d'un client" },
] as const;

export function InviterMembre({
  clients,
}: {
  clients: { id: string; name: string }[];
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("agent");
  const [clientId, setClientId] = useState<string>("");
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<
    { type: "ok" | "erreur"; texte: string } | null
  >(null);

  async function inviter(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setRetour(null);
    const resultat = await inviterMembre({
      email,
      role,
      clientId: role === "gestionnaire" ? clientId : null,
    });
    setEnCours(false);
    if ("erreur" in resultat) {
      setRetour({ type: "erreur", texte: resultat.erreur });
      return;
    }
    setRetour({
      type: "ok",
      texte: resultat.message ?? `Invitation envoyée à ${email}.`,
    });
    setEmail("");
  }

  return (
    <form onSubmit={inviter} className="grid gap-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
      <div className="space-y-2">
        <Label htmlFor="invitation-email">Inviter par e-mail</Label>
        <Input
          id="invitation-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Rôle</Label>
        <Select value={role} onValueChange={(v) => v && setRole(v)}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {role === "gestionnaire" && (
        <div className="space-y-2">
          <Label>Client suivi</Label>
          <Select value={clientId} onValueChange={(v) => v && setClientId(v)}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder={clients.length ? "Choisir" : "Aucun client"} />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <Button type="submit" disabled={enCours}>
        {enCours ? "Envoi…" : "Inviter"}
      </Button>
      {retour && (
        <Alert variant={retour.type === "erreur" ? "destructive" : "default"} className="sm:col-span-4">
          <AlertDescription>{retour.texte}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
