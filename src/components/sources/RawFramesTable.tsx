import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Trame {
  id: number;
  recu_le: string;
  dev_eui: string | null;
  statut: string;
  erreur: string | null;
  releve_ts: string | null;
  releve_volume_m3: number | null;
  source_id: string;
}

const LABEL_STATUT: Record<string, string> = {
  ok: "OK",
  doublon: "Doublon",
  appareil_inconnu: "Équipement inconnu",
  erreur_decodage: "Erreur de décodage",
};

const VARIANT_STATUT: Record<string, "secondary" | "outline" | "destructive"> = {
  ok: "secondary",
  doublon: "outline",
  appareil_inconnu: "outline",
  erreur_decodage: "destructive",
};

export function RawFramesTable({
  trames,
  sources,
}: {
  trames: Trame[];
  sources: { id: string; nom: string }[];
}) {
  const nomSource = (id: string) => sources.find((s) => s.id === id)?.nom ?? "—";

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Reçue le</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>DevEUI</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead>Relevé créé</TableHead>
          <TableHead>Détail</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {trames.map((t) => (
          <TableRow key={t.id}>
            <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
              {new Date(t.recu_le).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}
            </TableCell>
            <TableCell>{nomSource(t.source_id)}</TableCell>
            <TableCell className="font-mono text-xs">{t.dev_eui ?? "—"}</TableCell>
            <TableCell>
              <Badge variant={VARIANT_STATUT[t.statut] ?? "outline"}>
                {LABEL_STATUT[t.statut] ?? t.statut}
              </Badge>
            </TableCell>
            <TableCell>
              {t.releve_volume_m3 !== null
                ? `${t.releve_volume_m3.toFixed(3)} m³`
                : "—"}
            </TableCell>
            <TableCell className="text-muted-foreground max-w-xs truncate text-xs">
              {t.erreur ?? "—"}
            </TableCell>
          </TableRow>
        ))}
        {trames.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-muted-foreground text-center">
              Aucune trame reçue pour l&apos;instant.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
