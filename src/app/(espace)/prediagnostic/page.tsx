import { redirect } from "next/navigation";
import { getContexteUtilisateur } from "@/lib/auth/contexte";
import { peutPrediagnostic, reglagesPrediagnostic } from "@/lib/gardien/prediagnosticServeur";
import { FormulairePrediagnostic } from "@/components/prediagnostic/FormulairePrediagnostic";

/**
 * Pré-diagnostic (superadmin et partenaire) : ce que coûtent les fuites
 * au client et ce que coûte le service, avec un PDF à la marque.
 */
export default async function PrediagnosticPage() {
  const ctx = await getContexteUtilisateur();
  if (!peutPrediagnostic(ctx)) redirect("/accueil");
  const { tarifs, debits } = await reglagesPrediagnostic();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pré-diagnostic</h1>
        <p className="text-muted-foreground text-sm">
          À remplir avec le prospect : le résultat s&apos;affiche au fur et à mesure.
        </p>
      </div>
      <FormulairePrediagnostic tarifs={tarifs} debits={debits} />
    </div>
  );
}
