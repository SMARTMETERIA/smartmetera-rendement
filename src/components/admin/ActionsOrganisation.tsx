"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supprimerOrganisation } from "@/app/(dashboard)/admin/actions";

/** Export complet puis suppression définitive d'une organisation. */
export function ActionsOrganisation({ id, nom }: { id: string; nom: string }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function supprimer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    const resultat = await supprimerOrganisation({
      organizationId: id,
      confirmationNom: confirmation,
    });
    setEnCours(false);
    if ("erreur" in resultat) {
      setErreur(resultat.erreur);
      return;
    }
    setOuvert(false);
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-1">
      <a
        href={`/api/admin/export/${id}`}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        Exporter
      </a>
      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogTrigger render={<Button type="button" variant="ghost" size="sm" />}>
          Supprimer
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={supprimer} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Supprimer « {nom} »</DialogTitle>
              <DialogDescription>
                Toutes les données de cette organisation seront effacées
                définitivement, registre des envois compris. Exportez-les
                d&apos;abord (export de moins de 24 heures exigé).
              </DialogDescription>
            </DialogHeader>
            {erreur && (
              <Alert variant="destructive">
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor={`confirmation-${id}`}>
                Tapez le nom exact de l&apos;organisation
              </Label>
              <Input
                id={`confirmation-${id}`}
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="submit" variant="destructive" disabled={enCours || confirmation !== nom}>
                {enCours ? "Suppression…" : "Supprimer définitivement"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
