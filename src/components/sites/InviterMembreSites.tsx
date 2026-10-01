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
import { inviterMembreSites } from "@/app/(espace)/sites/equipe/actions";

const ROLES = [
  { value: "directeur_site", label: "Directeur de site (un site)" },
  { value: "technicien", label: "Technicien (alertes et poses)" },
  { value: "agent", label: "Agent (tous les sites)" },
  { value: "lecteur", label: "Lecteur (consultation)" },
  { value: "admin_client", label: "Administrateur" },
] as const;

const TOUS_LES_SITES = "tous";

export function InviterMembreSites({
  sites,
}: {
  sites: { id: string; name: string }[];
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("directeur_site");
  const [siteId, setSiteId] = useState<string>("");
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<{
    type: "ok" | "erreur";
    texte: string;
  } | null>(null);

  const choixSite = role === "directeur_site" || role === "technicien";

  async function inviter(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setRetour(null);
    const resultat = await inviterMembreSites({
      email,
      role,
      siteId: choixSite && siteId !== TOUS_LES_SITES ? siteId : null,
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
    <form
      onSubmit={inviter}
      className="grid gap-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
    >
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
        <Label htmlFor="invitation-role">Rôle</Label>
        <Select
          items={ROLES}
          value={role}
          onValueChange={(v) => v && setRole(v)}
        >
          <SelectTrigger id="invitation-role" className="w-full sm:w-64">
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
      {choixSite && (
        <div className="space-y-2">
          <Label htmlFor="invitation-site">Site</Label>
          <Select
            items={[
              { value: TOUS_LES_SITES, label: "Tous les sites" },
              ...sites.map((s) => ({ value: s.id, label: s.name })),
            ]}
            value={siteId}
            onValueChange={(v) => v && setSiteId(v)}
          >
            <SelectTrigger id="invitation-site" className="w-full sm:w-56">
              <SelectValue
                placeholder={sites.length ? "Choisir" : "Aucun site"}
              />
            </SelectTrigger>
            <SelectContent>
              {role === "technicien" && (
                <SelectItem value={TOUS_LES_SITES}>Tous les sites</SelectItem>
              )}
              {sites.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
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
        <Alert
          variant={retour.type === "erreur" ? "destructive" : "default"}
          className="sm:col-span-4"
        >
          <AlertDescription>{retour.texte}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
