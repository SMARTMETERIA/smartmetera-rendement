import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteUtilisateur } from "@/lib/auth/contexte";
import { LIBELLES_FLUIDE, LIBELLES_UNITE } from "@/lib/immeuble/libelles";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Consommation {
  fluid: string;
  unit: string;
  consumption: number;
  days: number;
}

interface Logement {
  occupancy_id: string;
  unit_label: string;
  building_name: string;
  city: string | null;
  organization_name: string;
  start_date: string;
  consommations: Consommation[];
}

const FORMAT_MOIS = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const FORMAT_NOMBRE = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 2,
});

/**
 * Espace occupant, version minimale (phase 2) : données obtenues
 * uniquement par la RPC occupant_home(), filtrée sur la période
 * d'occupation. La page complète (historique 13 mois, préférences) arrive
 * en phase 7.
 */
export default async function MonLogementPage() {
  const ctx = await getContexteUtilisateur();
  if (!ctx.estOccupant) redirect("/accueil");
  const supabase = await createClient();
  const { data } = await supabase.rpc("occupant_home");
  const accueil = data as { dernier_mois: string; logements: Logement[] } | null;
  const mois = accueil ? FORMAT_MOIS.format(new Date(accueil.dernier_mois)) : "";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Mon logement</h1>
      {(accueil?.logements ?? []).map((l) => (
        <Card key={l.occupancy_id}>
          <CardHeader>
            <CardTitle>
              {l.building_name} — {l.unit_label}
            </CardTitle>
            <CardDescription>
              {l.city ? `${l.city} · ` : ""}Suivi par {l.organization_name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-muted-foreground text-sm">Consommation de {mois}</p>
            {l.consommations.length === 0 ? (
              <p className="text-sm">Pas encore de relevé pour ce mois.</p>
            ) : (
              <ul className="space-y-1">
                {l.consommations.map((c) => (
                  <li key={c.fluid} className="flex items-baseline justify-between gap-4">
                    <span>{LIBELLES_FLUIDE[c.fluid] ?? c.fluid}</span>
                    <span className="text-2xl font-semibold tabular-nums">
                      {FORMAT_NOMBRE.format(c.consumption)} {LIBELLES_UNITE[c.unit] ?? c.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
