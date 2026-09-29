import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ENTETE_CSV_USAGE, lignesCsvUsage, type UsageMonnaie } from "@/lib/gardien/usage";

/** Export CSV de l'usage mensuel (superadmin), à partir des lignes calculées. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: estAdmin } = await supabase.rpc("is_platform_admin");
  if (estAdmin !== true) return NextResponse.json({ erreur: "Réservé au superadmin." }, { status: 403 });
  const mois = new URL(request.url).searchParams.get("mois") ?? "";
  if (!/^\d{4}-\d{2}$/.test(mois)) return NextResponse.json({ erreur: "Mois invalide." }, { status: 400 });
  const { data } = await supabase
    .from("usage_monthly")
    .select("currency, active_points, setup_points, temperature_points, amount_ht, withholding_tax_amount, gross_amount, details, organizations(nom)")
    .eq("period", `${mois}-01`)
    .order("currency");
  const lignes = (data ?? []).flatMap((u) => {
    const org = Array.isArray(u.organizations) ? u.organizations[0] : u.organizations;
    const d = (u.details ?? {}) as Record<string, unknown>;
    const usage: UsageMonnaie = {
      monnaie: u.currency === "MAD" ? "MAD" : "EUR",
      pointsActifs: u.active_points,
      misesEnService: u.setup_points,
      sondes: u.temperature_points,
      lignes: [],
      brut: Number(u.gross_amount),
      remise: Number(d.remise ?? 0),
      ht: Number(u.amount_ht),
      retenuePct: Number(d.retenue_pct ?? 0),
      retenue: Number(u.withholding_tax_amount),
      net: Number(d.net ?? u.amount_ht),
      incomplet: d.incomplet === true,
      sitesEnPilote: (d.sites_en_pilote as string[] | undefined) ?? [],
    };
    return lignesCsvUsage((org as { nom?: string } | null)?.nom ?? "", mois, [usage]);
  });
  return new Response(`﻿${[ENTETE_CSV_USAGE.join(";"), ...lignes].join("\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="usage-${mois}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
