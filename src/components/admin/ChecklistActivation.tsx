"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Organisation {
  id: string;
  nom: string;
}

interface Item {
  id: string;
  jour: number;
  ordre: number;
  titre: string;
  description: string | null;
}

interface Suivi {
  organization_id: string;
  item_id: string;
  fait: boolean;
  fait_le: string | null;
}

export function ChecklistActivation({
  organisations,
  items,
  suivi,
}: {
  organisations: Organisation[];
  items: Item[];
  suivi: Suivi[];
}) {
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState(organisations[0]?.id ?? "");

  const suiviParItem = useMemo(() => {
    const map = new Map<string, Suivi>();
    for (const s of suivi) {
      if (s.organization_id === organizationId) map.set(s.item_id, s);
    }
    return map;
  }, [suivi, organizationId]);

  const parJour = useMemo(() => {
    const groupes = new Map<number, Item[]>();
    for (const item of items) {
      const liste = groupes.get(item.jour) ?? [];
      liste.push(item);
      groupes.set(item.jour, liste);
    }
    return [...groupes.entries()].sort((a, b) => a[0] - b[0]);
  }, [items]);

  async function basculer(item: Item, fait: boolean) {
    const supabase = createClient();
    await supabase.from("checklist_activation_suivi").upsert(
      {
        organization_id: organizationId,
        item_id: item.id,
        fait,
        fait_le: fait ? new Date().toISOString() : null,
      },
      { onConflict: "organization_id,item_id" },
    );
    router.refresh();
  }

  const total = items.length;
  const nbFaits = items.filter((i) => suiviParItem.get(i.id)?.fait).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Label>Organisation</Label>
        <Select value={organizationId} onValueChange={(v) => v && setOrganizationId(v)}>
          <SelectTrigger className="w-64">
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
        {organizationId && (
          <Badge variant={nbFaits === total ? "secondary" : "outline"}>
            {nbFaits} / {total}
          </Badge>
        )}
      </div>

      {organizationId && (
        <div className="space-y-5">
          {parJour.map(([jour, itemsJour]) => (
            <div key={jour} className="space-y-2">
              <h3 className="text-sm font-semibold">J{jour}</h3>
              <ul className="space-y-1.5">
                {itemsJour
                  .sort((a, b) => a.ordre - b.ordre)
                  .map((item) => {
                    const etat = suiviParItem.get(item.id);
                    return (
                      <li key={item.id} className="flex items-start gap-2 rounded-lg border p-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={etat?.fait ?? false}
                          onChange={(e) => basculer(item, e.target.checked)}
                        />
                        <div>
                          <p className={`text-sm ${etat?.fait ? "text-muted-foreground line-through" : ""}`}>
                            {item.titre}
                          </p>
                          {item.description && (
                            <p className="text-muted-foreground text-xs">{item.description}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
