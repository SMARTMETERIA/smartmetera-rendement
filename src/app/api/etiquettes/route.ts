import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { urlSite } from "@/lib/auth/liens";
import { construirePlancheEtiquettes } from "@/lib/gardien/planchePdf";
import { limiterDebit } from "@/lib/securite/protection";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAXIMUM = 240;

/**
 * Planche d'étiquettes QR (PDF A4) des appareils demandés
 * (/api/etiquettes?ids=a,b,c). Seuls les appareils visibles par
 * l'utilisateur connecté (RLS) sont imprimés.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: utilisateur } = await supabase.auth.getUser();
  if (!utilisateur.user) {
    return NextResponse.json(
      { erreur: "Connectez-vous pour imprimer des étiquettes." },
      { status: 401 },
    );
  }
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID.test(s))
    .slice(0, MAXIMUM);
  if (ids.length === 0) {
    return NextResponse.json(
      { erreur: "Aucun appareil demandé." },
      { status: 400 },
    );
  }

  const limite = await limiterDebit(`pdf:user:${utilisateur.user.id}`);
  if (limite) return limite;

  const { data } = await supabase
    .from("devices")
    .select("id, qr_code, device_ref, model")
    .in("id", ids)
    .not("qr_code", "is", null);
  const ordre = new Map(ids.map((id, i) => [id, i]));
  const etiquettes = (data ?? [])
    .sort((a, b) => (ordre.get(a.id) ?? 0) - (ordre.get(b.id) ?? 0))
    .map((d) => ({
      qrCode: d.qr_code as string,
      reference: d.device_ref,
      modele: d.model ?? "",
    }));
  if (etiquettes.length === 0) {
    return NextResponse.json(
      { erreur: "Aucune étiquette à imprimer." },
      { status: 404 },
    );
  }

  const pdf = await construirePlancheEtiquettes(etiquettes, urlSite());
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="etiquettes.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
