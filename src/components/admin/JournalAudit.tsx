import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Entree {
  id: number;
  organization_id: string | null;
  user_id: string | null;
  action: string;
  entite: string;
  entite_id: string | null;
  created_at: string;
  organizations: { nom: string }[] | { nom: string } | null;
}

const LABEL_ACTION: Record<string, string> = {
  insert: "Création",
  update: "Modification",
  delete: "Suppression",
};

function nomOrganisation(rel: Entree["organizations"]): string {
  if (Array.isArray(rel)) return rel[0]?.nom ?? "—";
  return rel?.nom ?? "—";
}

export function JournalAudit({ entrees }: { entrees: Entree[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Organisation</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Entité</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entrees.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                {new Date(e.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}
              </TableCell>
              <TableCell>{nomOrganisation(e.organizations)}</TableCell>
              <TableCell>
                <Badge variant="outline">{LABEL_ACTION[e.action] ?? e.action}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {e.entite}
                {e.entite_id ? ` (${e.entite_id.slice(0, 8)}…)` : ""}
              </TableCell>
            </TableRow>
          ))}
          {entrees.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground text-center">
                Aucune entrée pour l&apos;instant.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
