"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { inviterUtilisateur } from "@/app/(dashboard)/admin/actions";

interface Organisation {
  id: string;
  nom: string;
}

const ROLES = [
  { value: "admin_client", label: "Admin client" },
  { value: "agent", label: "Agent" },
  { value: "lecteur", label: "Lecteur" },
  { value: "superadmin", label: "Superadmin" },
] as const;

export function InviterUtilisateur({ organisations }: { organisations: Organisation[] }) {
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState(organisations[0]?.id ?? "");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("admin_client");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  async function inviter(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    setSucces(false);
    const resultat = await inviterUtilisateur({ organizationId, email, role });
    setEnCours(false);
    if ("erreur" in resultat) {
      setErreur(resultat.erreur);
      return;
    }
    setSucces(true);
    setEmail("");
    router.refresh();
  }

  return (
    <form onSubmit={inviter} className="max-w-lg space-y-4">
      {erreur && (
        <Alert variant="destructive">
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}
      {succes && (
        <Alert>
          <AlertDescription>Invitation envoyée.</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label>Organisation</Label>
        <Select value={organizationId} onValueChange={(v) => v && setOrganizationId(v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choisir une organisation" />
          </SelectTrigger>
          <SelectContent>
            {organisations.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite-email">E-mail</Label>
        <Input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="prenom.nom@regie-eau.fr"
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Rôle</Label>
        <Select value={role} onValueChange={(v) => v && setRole(v)}>
          <SelectTrigger className="w-full">
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
      <Button type="submit" disabled={enCours || !organizationId}>
        {enCours ? "Envoi…" : "Inviter"}
      </Button>
    </form>
  );
}
