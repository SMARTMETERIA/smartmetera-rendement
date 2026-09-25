import Link from "next/link";
import { FormulaireInscription } from "@/components/auth/FormulaireInscription";

export default function InscriptionPage() {
  return (
    <>
      <FormulaireInscription />
      <p className="text-muted-foreground text-sm">
        Déjà un compte ?{" "}
        <Link href="/connexion" className="text-foreground underline underline-offset-4">
          Se connecter
        </Link>
      </p>
    </>
  );
}
