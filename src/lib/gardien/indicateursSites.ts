// Indicateurs de chaque site pour la vue groupe (siège, partenaire) :
// litres par unité d'activité du dernier mois complet et alertes en cours.
// Code serveur, avec le client Supabase de l'utilisateur (RLS).
import type { SupabaseClient } from "@supabase/supabase-js";
import { indicateurActivite } from "@/lib/moteur-gardien/activite";
import { UNITES_ACTIVITE } from "@/lib/gardien-rapports/contenus";

export interface SiteIndicateurs {
  id: string;
  activity_unit: string;
  capacity: number | null;
  occupancy_rate_default: number | null;
}

export interface Indicateurs {
  litresParUnite: number | null;
  estimation: boolean;
  unite: string | null;
  alertes: number;
}

/** Premier jour du mois précédent et du mois courant (« AAAA-MM-01 »). */
export function dernierMoisComplet(aujourdhui: string): { debut: string; fin: string; jours: number } {
  const fin = `${aujourdhui.slice(0, 7)}-01`;
  const d = new Date(`${fin}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const debut = d.toISOString().slice(0, 10);
  return { debut, fin, jours: Math.round((Date.parse(`${fin}T12:00:00Z`) - d.getTime()) / 86_400_000) };
}

export async function indicateursSites(
  supabase: SupabaseClient,
  sites: SiteIndicateurs[],
  aujourdhui: string,
  options: { equipe?: boolean } = {},
): Promise<Map<string, Indicateurs>> {
  const resultat = new Map<string, Indicateurs>();
  if (!sites.length) return resultat;
  const ids = sites.map((s) => s.id);
  const mois = dernierMoisComplet(aujourdhui);
  const [{ data: compteurs }, { data: activite }, { data: fuites }, { data: alertes }] = await Promise.all([
    supabase.from("meters").select("id, site_id").in("site_id", ids).eq("type", "point_comptage"),
    supabase
      .from("activity_data")
      .select("site_id, date, period, quantity")
      .in("site_id", ids)
      .gte("date", mois.debut)
      .lt("date", mois.fin),
    supabase.from("leak_events").select("site_id").in("site_id", ids).in("status", ["ouverte", "prise_en_compte"]),
    // Capteurs muets : comptés pour l'équipe seulement (comme la page « Alertes »).
    supabase
      .from("alerts")
      .select("site_id")
      .in("site_id", ids)
      .in("statut", ["ouverte", "acquittee"])
      .in("type", options.equipe === false ? ["temperature_basse", "rappel_analyses"] : ["compteur_muet", "temperature_basse", "rappel_analyses"]),
  ]);
  const siteDuCompteur = new Map((compteurs ?? []).map((m) => [m.id as string, m.site_id as string]));
  const { data: jours } = siteDuCompteur.size
    ? await supabase
        .from("meter_days")
        .select("meter_id, volume_m3")
        .in("meter_id", [...siteDuCompteur.keys()])
        .gte("day", mois.debut)
        .lt("day", mois.fin)
        .limit(20000)
    : { data: [] as { meter_id: string; volume_m3: number }[] };
  const volumes = new Map<string, number>();
  for (const j of jours ?? []) {
    const s = siteDuCompteur.get(j.meter_id);
    if (s) volumes.set(s, (volumes.get(s) ?? 0) + Number(j.volume_m3));
  }
  for (const s of sites) {
    const saisies = (activite ?? []).filter((a) => a.site_id === s.id);
    const mensuelle = saisies.find((a) => a.period === "mois");
    const quantite = mensuelle
      ? Number(mensuelle.quantity)
      : saisies.length
        ? saisies.reduce((t, a) => t + Number(a.quantity), 0)
        : null;
    const volume = volumes.get(s.id);
    const indicateur =
      volume !== undefined
        ? indicateurActivite({
            volumeM3: volume,
            quantiteSaisie: quantite,
            capacite: s.capacity,
            tauxOccupation: s.occupancy_rate_default == null ? null : Number(s.occupancy_rate_default),
            joursDansMois: mois.jours,
            unite: s.activity_unit,
          })
        : null;
    resultat.set(s.id, {
      litresParUnite: indicateur?.litresParUnite ?? null,
      estimation: indicateur?.estimation ?? false,
      unite: UNITES_ACTIVITE[s.activity_unit] ?? null,
      alertes:
        (fuites ?? []).filter((f) => f.site_id === s.id).length +
        (alertes ?? []).filter((a) => a.site_id === s.id).length,
    });
  }
  return resultat;
}
