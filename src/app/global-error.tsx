"use client";

import { useEffect } from "react";
import "./globals.css";
import { envoyerErreurNavigateur } from "@/lib/erreurs/navigateur";

// Remplace la mise en page racine quand elle-même échoue : elle doit
// fournir <html> et <body> et charger le thème.
export default function ErreurGlobale({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    envoyerErreurNavigateur(error);
  }, [error]);

  return (
    <html lang="fr">
      <body className="bg-background text-foreground flex min-h-screen items-center justify-center p-6 font-sans">
        <title>SmartMeteria : erreur</title>
        <main className="flex max-w-md flex-col items-center gap-4 text-center">
          <h1 className="text-2xl font-semibold">Le service n&apos;a pas pu s&apos;afficher</h1>
          <p className="text-muted-foreground">
            Un problème est survenu de notre côté. Il nous a été signalé. Réessayez dans un instant.
          </p>
          {error.digest ? <p className="text-muted-foreground text-xs">Référence : {error.digest}</p> : null}
          <button
            type="button"
            onClick={() => retry()}
            className="bg-primary text-primary-foreground h-11 rounded-md px-5 font-medium"
          >
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
