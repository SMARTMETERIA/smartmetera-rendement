import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface EmailEntrant {
  id: number;
  recu_le: string;
  expediteur: string;
  objet: string | null;
  piece_jointe_nom: string | null;
  statut: string;
  erreur: string | null;
  source_id: string;
}

const LABEL_STATUT: Record<string, string> = {
  traite: "Traité",
  piece_jointe_manquante: "Pièce jointe manquante",
  format_non_supporte: "Format non supporté",
  erreur: "Erreur",
};

const VARIANT_STATUT: Record<string, "secondary" | "outline" | "destructive"> = {
  traite: "secondary",
  piece_jointe_manquante: "outline",
  format_non_supporte: "outline",
  erreur: "destructive",
};

export function InboundEmailsTable({
  emails,
  sources,
}: {
  emails: EmailEntrant[];
  sources: { id: string; nom: string }[];
}) {
  const nomSource = (id: string) => sources.find((s) => s.id === id)?.nom ?? "—";

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Reçu le</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Expéditeur</TableHead>
          <TableHead>Pièce jointe</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead>Détail</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {emails.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
              {new Date(e.recu_le).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}
            </TableCell>
            <TableCell>{nomSource(e.source_id)}</TableCell>
            <TableCell className="text-xs">{e.expediteur}</TableCell>
            <TableCell className="text-xs">{e.piece_jointe_nom ?? "—"}</TableCell>
            <TableCell>
              <Badge variant={VARIANT_STATUT[e.statut] ?? "outline"}>
                {LABEL_STATUT[e.statut] ?? e.statut}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground max-w-xs truncate text-xs">
              {e.erreur ?? "—"}
            </TableCell>
          </TableRow>
        ))}
        {emails.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-muted-foreground text-center">
              Aucun e-mail reçu pour l&apos;instant.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
