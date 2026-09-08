import { createClient } from "@/lib/supabase/server";
import { CalculateurRoiForm } from "@/components/roi/CalculateurRoiForm";
import type { EntreesFormulaire } from "@/components/roi/CalculateurRoiForm";

async function chargerDonneesInternes(): Promise<{
  donnees: EntreesFormulaire | null;
  organisationNom: string | null;
}> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { donnees: null, organisationNom: null };

  const { data: membership } = await supabase
    .from("memberships")
    .select("organization_id, organizations(nom, lineaire_reseau_km, zone_repartition_eaux, prix_m3_eur)")
    .eq("user_id", userData.user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) return { donnees: null, organisationNom: null };

  const org = membership.organizations as unknown as {
    nom: string;
    lineaire_reseau_km: number | null;
    zone_repartition_eaux: boolean;
    prix_m3_eur: number;
  } | null;

  const { data: bilan } = await supabase
    .from("bilans_calcules")
    .select("v_produit, v_importe, v_exporte, v_comptabilise, v_sans_comptage, v_service")
    .eq("organization_id", membership.organization_id)
    .eq("type_periode", "annee_civile")
    .order("periode_fin", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!bilan || !org) return { donnees: null, organisationNom: org?.nom ?? null };

  return {
    organisationNom: org.nom,
    donnees: {
      vProduit: bilan.v_produit,
      vImporte: bilan.v_importe,
      vExporte: bilan.v_exporte,
      vComptabilise: bilan.v_comptabilise,
      vSansComptage: bilan.v_sans_comptage,
      vService: bilan.v_service,
      lineaireKm: org.lineaire_reseau_km ?? 0,
      zoneDeRepartitionDesEaux: org.zone_repartition_eaux,
      prixPalierEurM3: org.prix_m3_eur,
      coutMarginalEurM3: 0.5,
      redevanceEurM3: 0.1,
      coutTravauxEur: 0,
      tauxSubventionPct: 30,
    },
  };
}

export default async function RoiPage() {
  const { donnees, organisationNom } = await chargerDonneesInternes();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Calculateur de retour sur investissement — rendement de réseau
        </h1>
        <p className="text-muted-foreground text-sm">
          Estimez votre rendement, votre conformité au décret 2012-97, la
          valeur de vos pertes et le retour sur investissement d&apos;une
          réduction de fuites.{" "}
          {organisationNom && (
            <>Préréempli avec les données de <strong>{organisationNom}</strong>.</>
          )}
        </p>
      </div>
      <CalculateurRoiForm donneesInitiales={donnees} />
      <p className="text-muted-foreground mt-8 text-xs">
        Estimation indicative basée sur les formules du décret n°2012-97 du
        26 janvier 2012. La pénalité potentielle correspond au doublement de
        la redevance prélèvement (article L213-10-9 du code de
        l&apos;environnement) applicable en l&apos;absence de plan d&apos;actions
        passé le délai réglementaire — elle ne constitue pas un conseil
        juridique ou fiscal.
      </p>
    </main>
  );
}
