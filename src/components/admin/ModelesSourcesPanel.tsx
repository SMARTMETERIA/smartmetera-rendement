"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Source {
  id: string;
  nom: string;
  organization_id: string;
  default_template_id: string | null;
  organizations: { nom: string }[] | { nom: string } | null;
}

interface Modele {
  id: string;
  nom: string;
  is_system: boolean;
  organization_id: string | null;
}

function nomOrganisation(rel: Source["organizations"]): string {
  if (Array.isArray(rel)) return rel[0]?.nom ?? "—";
  return rel?.nom ?? "—";
}

export function ModelesSourcesPanel({
  sources,
  modeles,
}: {
  sources: Source[];
  modeles: Modele[];
}) {
  const router = useRouter();

  async function assigner(sourceId: string, templateId: string) {
    const supabase = createClient();
    await supabase.from("sources").update({ default_template_id: templateId }).eq("id", sourceId);
    router.refresh();
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Organisation</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Modèle assigné</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sources.map((s) => {
          const modelesDisponibles = modeles.filter(
            (m) => m.is_system || m.organization_id === s.organization_id,
          );
          return (
            <TableRow key={s.id}>
              <TableCell>{nomOrganisation(s.organizations)}</TableCell>
              <TableCell>{s.nom}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Select
                    value={s.default_template_id ?? undefined}
                    onValueChange={(v) => v && assigner(s.id, v)}
                  >
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="Aucun modèle" />
                    </SelectTrigger>
                    <SelectContent>
                      {modelesDisponibles.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!s.default_template_id && <Badge variant="destructive">À configurer</Badge>}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
        {sources.length === 0 && (
          <TableRow>
            <TableCell colSpan={3} className="text-muted-foreground text-center">
              Aucune source de type boîte mail entrante pour l&apos;instant.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
