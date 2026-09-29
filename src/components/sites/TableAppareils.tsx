"use client";

import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { attribuerLot } from "@/app/(espace)/sites/appareils/actions";

export interface LigneAppareil {
  id: string;
  reference: string;
  modele: string;
  etat: string;
  site: string | null;
  pile: string;
  dernierMessage: string;
  qr: boolean;
  attribuable: boolean;
}

export function TableAppareils({
  appareils,
  sites,
}: {
  appareils: LigneAppareil[];
  sites: { id: string; name: string }[];
}) {
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [siteId, setSiteId] = useState("");
  const [message, setMessage] = useState<{
    erreur: boolean;
    texte: string;
  } | null>(null);
  const [enCours, setEnCours] = useState(false);

  function basculer(id: string) {
    setChoisis((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const tous = appareils.length > 0 && choisis.size === appareils.length;
  const idsEtiquettes = appareils
    .filter((a) => choisis.has(a.id) && a.qr)
    .map((a) => a.id);
  const idsAttribuables = appareils
    .filter((a) => choisis.has(a.id) && a.attribuable)
    .map((a) => a.id);

  async function attribuer() {
    setEnCours(true);
    const r = await attribuerLot(idsAttribuables, siteId);
    setEnCours(false);
    setMessage(
      "erreur" in r
        ? { erreur: true, texte: r.erreur }
        : {
            erreur: false,
            texte: `${r.nombre} appareil${r.nombre > 1 ? "s" : ""} attribué${r.nombre > 1 ? "s" : ""}.`,
          },
    );
    if ("ok" in r) setChoisis(new Set());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          items={sites.map((s) => ({ value: s.id, label: s.name }))}
          value={siteId}
          onValueChange={(v) => v && setSiteId(v)}
        >
          <SelectTrigger
            className="w-full sm:w-60"
            aria-label="Site d'attribution"
          >
            <SelectValue placeholder="Choisir un site" />
          </SelectTrigger>
          <SelectContent>
            {sites.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={attribuer}
          disabled={enCours || !siteId || idsAttribuables.length === 0}
        >
          Attribuer au site ({idsAttribuables.length})
        </Button>
        <a
          href={
            idsEtiquettes.length
              ? `/api/etiquettes?ids=${idsEtiquettes.join(",")}`
              : undefined
          }
          aria-disabled={idsEtiquettes.length === 0}
          className={cn(
            buttonVariants({ variant: "outline" }),
            idsEtiquettes.length === 0 && "pointer-events-none opacity-50",
          )}
        >
          Imprimer les étiquettes ({idsEtiquettes.length})
        </a>
      </div>
      {message && (
        <Alert variant={message.erreur ? "destructive" : "default"}>
          <AlertDescription>{message.texte}</AlertDescription>
        </Alert>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                aria-label="Tout sélectionner"
                checked={tous}
                onChange={() =>
                  setChoisis(
                    tous ? new Set() : new Set(appareils.map((a) => a.id)),
                  )
                }
              />
            </TableHead>
            <TableHead>Référence</TableHead>
            <TableHead>Modèle</TableHead>
            <TableHead>État</TableHead>
            <TableHead>Site</TableHead>
            <TableHead>Pile</TableHead>
            <TableHead>Dernier message</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {appareils.map((a) => (
            <TableRow key={a.id}>
              <TableCell>
                <input
                  type="checkbox"
                  aria-label={`Sélectionner ${a.reference}`}
                  checked={choisis.has(a.id)}
                  onChange={() => basculer(a.id)}
                />
              </TableCell>
              <TableCell className="font-mono text-sm tabular-nums">
                {a.reference}
              </TableCell>
              <TableCell>{a.modele}</TableCell>
              <TableCell>{a.etat}</TableCell>
              <TableCell>{a.site ?? "—"}</TableCell>
              <TableCell className="tabular-nums">{a.pile}</TableCell>
              <TableCell>{a.dernierMessage}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
