import { envoyerErreurNavigateur } from "@/lib/erreurs/navigateur";

// Erreurs non rattrapées du navigateur (voir src/lib/erreurs/navigateur.ts).
window.addEventListener("error", (evenement) => envoyerErreurNavigateur(evenement.error ?? evenement.message));
window.addEventListener("unhandledrejection", (evenement) => envoyerErreurNavigateur(evenement.reason));
