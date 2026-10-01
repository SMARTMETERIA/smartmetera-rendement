import type { Instrumentation } from "next";
import { environnementCourant, signalerErreur, versionCourante } from "@/lib/erreurs/sentry";

// Erreurs du serveur (pages, routes, actions) vers Sentry, sans données
// personnelles. Sans SENTRY_DSN, rien ne part.
export const onRequestError: Instrumentation.onRequestError = async (erreur, requete, contexte) => {
  await signalerErreur(erreur, {
    origine: "serveur",
    chemin: requete.path,
    methode: requete.method,
    environnement: environnementCourant(),
    version: versionCourante(),
    etiquettes: { route: contexte.routePath, type: contexte.routeType },
  });
};
