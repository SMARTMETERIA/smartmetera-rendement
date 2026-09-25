import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TABLES_EXPORTEES, nomFichierExport } from "@/lib/admin/exportOrganisation";

const TAILLE_PAGE = 1000;

/**
 * Export complet d'une organisation (superadmin) : une ligne JSON par
 * enregistrement, {"table": …, "ligne": {…}}, table par table. L'export
 * est tracé dans audit_log (condition de la suppression).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: estAdmin } = await supabase.rpc("is_platform_admin");
  if (estAdmin !== true) {
    return NextResponse.json({ erreur: "Réservé aux superadmins." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, slug")
    .eq("id", id)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ erreur: "Organisation introuvable." }, { status: 404 });
  }

  const { error: erreurJournal } = await supabase.rpc("journaliser_export", {
    p_organization_id: org.id,
  });
  if (erreurJournal) {
    return NextResponse.json({ erreur: erreurJournal.message }, { status: 500 });
  }

  const encodeur = new TextEncoder();
  const flux = new ReadableStream<Uint8Array>({
    async start(controleur) {
      try {
        for (const { table, tri, colonne } of TABLES_EXPORTEES) {
          for (let debut = 0; ; debut += TAILLE_PAGE) {
            let requete = admin.from(table).select("*").eq(colonne, org.id);
            for (const c of tri) requete = requete.order(c, { ascending: true });
            const { data, error } = await requete.range(debut, debut + TAILLE_PAGE - 1);
            if (error) throw new Error(`${table} : ${error.message}`);
            for (const ligne of data ?? []) {
              controleur.enqueue(encodeur.encode(`${JSON.stringify({ table, ligne })}\n`));
            }
            if (!data || data.length < TAILLE_PAGE) break;
          }
        }
        controleur.close();
      } catch (err) {
        controleur.enqueue(
          encodeur.encode(
            `${JSON.stringify({ erreur: err instanceof Error ? err.message : String(err) })}\n`,
          ),
        );
        controleur.close();
      }
    },
  });

  return new Response(flux, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomFichierExport(org.slug)}"`,
      "Cache-Control": "no-store",
    },
  });
}
