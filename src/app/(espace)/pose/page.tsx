import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEspaceSites, peutPoser } from "@/lib/auth/espaces";
import { formaterDateHeure } from "@/lib/gardien/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EntreeCode } from "@/components/pose/EntreeCode";

interface PoseRecente {
  id: string;
  started_at: string;
  zone: string | null;
  status: string;
  sites: { name: string; timezone: string } | null;
  devices: {
    device_ref: string;
    model: string | null;
    first_data_at: string | null;
  } | null;
}

/**
 * Poser un capteur : scanner l'étiquette ouvre directement l'assistant ;
 * sinon, saisir le code. En dessous, les poses récentes de l'utilisateur.
 */
export default async function PosePage() {
  const ctx = await getEspaceSites();
  if (!peutPoser(ctx)) redirect("/sites");
  const supabase = await createClient();
  const { data } = await supabase
    .from("pose_sessions")
    .select(
      "id, started_at, zone, status, sites(name, timezone), devices(device_ref, model, first_data_at)",
    )
    .eq("started_by", ctx.userId)
    .order("started_at", { ascending: false })
    .limit(20);
  const poses = (data ?? []) as unknown as PoseRecente[];

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Poser un capteur
        </h1>
        <p className="text-muted-foreground">
          Scannez l&apos;étiquette du capteur avec l&apos;appareil photo du
          téléphone : l&apos;assistant s&apos;ouvre tout seul.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>L&apos;étiquette ne se scanne pas ?</CardTitle>
          <CardDescription>
            Tapez le code imprimé sous le QR code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EntreeCode />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Mes poses</h2>
        {poses.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucune pose pour l&apos;instant.
          </p>
        ) : (
          <ul className="divide-border divide-y rounded-lg border">
            {poses.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/pose/suivi/${p.id}`}
                  className="hover:bg-muted focus-visible:ring-ring/50 flex items-center justify-between gap-3 px-4 py-3 outline-none focus-visible:ring-3"
                >
                  <span>
                    <span className="block font-medium">
                      {p.sites?.name} · {p.zone}
                    </span>
                    <span className="text-muted-foreground block text-sm">
                      {formaterDateHeure(
                        p.started_at,
                        p.sites?.timezone ?? "Europe/Paris",
                      )}{" "}
                      · réf. {p.devices?.device_ref}
                    </span>
                  </span>
                  <span className="text-sm whitespace-nowrap">
                    {p.status === "abandonnee"
                      ? "Remplacée"
                      : p.devices?.first_data_at
                        ? "Transmet"
                        : "En attente"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
