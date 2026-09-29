import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEspaceSites, peutPoser } from "@/lib/auth/espaces";
import type { EtatPoseEcran } from "@/app/(espace)/pose/actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SuiviPose } from "@/components/pose/SuiviPose";
import { VerifierIndex } from "@/components/pose/VerifierIndex";

/** Suivi d'une pose : robinet test, puis vérification du réglage. */
export default async function SuiviPosePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getEspaceSites();
  if (!peutPoser(ctx)) redirect("/sites");
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: session }, { data: etat }] = await Promise.all([
    supabase
      .from("pose_sessions")
      .select(
        "id, meter_id, zone, photo_path, displayed_index_m3, sites(name, timezone)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("etat_pose", { p_session_id: id }),
  ]);
  if (!session || !etat) notFound();
  const site = session.sites as unknown as {
    name: string;
    timezone: string;
  } | null;

  let photo: string | null = null;
  if (session.photo_path) {
    const { data } = await supabase.storage
      .from("poses")
      .createSignedUrl(session.photo_path, 3600);
    photo = data?.signedUrl ?? null;
  }

  return (
    <div className="mx-auto max-w-md space-y-8">
      <p className="text-muted-foreground text-center text-sm">
        {site?.name} · {session.zone}
      </p>
      <SuiviPose
        sessionId={id}
        fuseau={site?.timezone ?? "Europe/Paris"}
        etatInitial={etat as EtatPoseEcran}
      />
      {session.meter_id && (
        <Card>
          <CardHeader>
            <CardTitle>Vérifier le réglage dans quelques jours</CardTitle>
            <CardDescription>
              Relevez l&apos;index du compteur et comparez-le à celui calculé
              par le capteur
              {session.displayed_index_m3 !== null &&
                ` (index à la pose : ${new Intl.NumberFormat("fr-FR").format(Number(session.displayed_index_m3))} m³)`}
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt="Photo du compteur à la pose"
                className="w-full rounded-lg border"
              />
            )}
            <VerifierIndex meterId={session.meter_id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
