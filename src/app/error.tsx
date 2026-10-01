"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { envoyerErreurNavigateur } from "@/lib/erreurs/navigateur";

export default function ErreurPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    envoyerErreurNavigateur(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Cette page n&apos;a pas pu s&apos;afficher</h1>
      <p className="text-muted-foreground">
        Un problème est survenu de notre côté. Il nous a été signalé. Réessayez dans un instant.
      </p>
      {error.digest ? (
        <p className="text-muted-foreground text-xs">Référence : {error.digest}</p>
      ) : null}
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Button onClick={() => retry()} className="h-11">
          Réessayer
        </Button>
        <Link href="/accueil" className={buttonVariants({ variant: "outline", className: "h-11" })}>
          Revenir à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}
