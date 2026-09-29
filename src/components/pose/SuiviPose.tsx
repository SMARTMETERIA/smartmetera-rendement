"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { lireEtatPose, type EtatPoseEcran } from "@/app/(espace)/pose/actions";
import { etapeAttente } from "@/lib/gardien/pose";
import { formaterEcheance, formaterNombre } from "@/lib/gardien/format";

const INTERVALLE_MS = 5000;

/**
 * Robinet test : l'écran interroge l'état de la pose toutes les 5 secondes
 * et passe au feu vert dès que le capteur a compté de l'eau (ou transmis une
 * température). Si la page reste ouverte, une notification du téléphone
 * prévient à l'arrivée de la première donnée.
 */
export function SuiviPose({
  sessionId,
  fuseau,
  etatInitial,
}: {
  sessionId: string;
  fuseau: string;
  etatInitial: EtatPoseEcran;
}) {
  const [etat, setEtat] = useState(etatInitial);
  const [erreurReseau, setErreurReseau] = useState(false);
  const precedent = useRef(etapeAttente(etatInitial).etape);
  const affichage = etapeAttente(etat);
  // Permission de notification lue seulement dans le navigateur (le rendu
  // serveur n'y a pas accès).
  const permission = useSyncExternalStore(
    () => () => {},
    () =>
      typeof Notification === "undefined"
        ? "indisponible"
        : Notification.permission,
    () => "indisponible",
  );
  const [notificationsDemandees, setNotificationsDemandees] = useState(false);

  useEffect(() => {
    if (affichage.etape === "feu_vert") return;
    const minuteur = setInterval(async () => {
      const resultat = await lireEtatPose(sessionId).catch(() => null);
      if (!resultat || "erreur" in resultat) {
        setErreurReseau(true);
        return;
      }
      setErreurReseau(false);
      setEtat(resultat);
    }, INTERVALLE_MS);
    return () => clearInterval(minuteur);
  }, [sessionId, affichage.etape]);

  useEffect(() => {
    const avant = precedent.current;
    precedent.current = affichage.etape;
    if (avant === affichage.etape || typeof Notification === "undefined")
      return;
    if (Notification.permission !== "granted") return;
    if (affichage.etape === "donnees_recues") {
      new Notification("Données reçues", {
        body: "Le capteur transmet. Ouvrez un robinet 30 secondes.",
      });
    } else if (affichage.etape === "feu_vert") {
      new Notification("Feu vert", { body: "Le capteur fonctionne." });
    }
  }, [affichage.etape]);

  function demanderNotifications() {
    setNotificationsDemandees(true);
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      void Notification.requestPermission();
    }
  }

  return (
    <div
      className="mx-auto flex max-w-md flex-col items-center gap-6 text-center"
      aria-live="polite"
    >
      {affichage.etape === "feu_vert" ? (
        <>
          <div className="bg-succes text-succes-foreground motion-safe:animate-in motion-safe:zoom-in-50 flex size-44 items-center justify-center rounded-full text-3xl font-bold">
            Feu vert
          </div>
          <h1 className="text-2xl font-semibold">
            {etat.nature === "eau"
              ? "Le capteur compte l'eau."
              : "La sonde transmet la température."}
          </h1>
          <p className="text-muted-foreground">
            {etat.nature === "eau"
              ? `${formaterNombre((etat.volume_depuis_pose_m3 ?? 0) * 1000, 0)} litres comptés depuis la pose.`
              : `${formaterNombre(etat.temperature_c ?? 0)} °C mesurés.`}
          </p>
        </>
      ) : affichage.etape === "donnees_recues" ? (
        <>
          <div className="bg-attention text-attention-foreground flex size-44 items-center justify-center rounded-full text-2xl font-bold">
            Données reçues
          </div>
          <h1 className="text-2xl font-semibold">
            {etat.nature === "eau"
              ? "Ouvrez un robinet pendant 30 secondes."
              : "Le capteur transmet : patientez jusqu'à la première mesure."}
          </h1>
          <p className="text-muted-foreground">
            Le feu passe au vert dès que le capteur a compté l&apos;eau, à sa
            prochaine transmission.
          </p>
        </>
      ) : (
        <>
          <div className="border-muted-foreground/40 flex size-44 items-center justify-center rounded-full border-4 border-dashed text-xl font-semibold motion-safe:animate-pulse">
            En attente
          </div>
          <h1 className="text-2xl font-semibold">
            En attente de la première donnée
          </h1>
          {affichage.heureAttendue ? (
            <p className="text-muted-foreground">
              Ce capteur transmet à heure fixe : première donnée attendue{" "}
              <strong className="text-foreground">
                {formaterEcheance(affichage.heureAttendue, fuseau)}
              </strong>{" "}
              (heure du site). Vous pouvez partir : l&apos;état de la pose reste
              visible dans « Mes poses ».
            </p>
          ) : (
            <p className="text-muted-foreground">
              Le capteur envoie sa première donnée dans les minutes qui suivent
              sa mise en marche. Ouvrez un robinet 30 secondes.
            </p>
          )}
          {permission === "default" && !notificationsDemandees && (
            <button
              type="button"
              onClick={demanderNotifications}
              className="text-primary underline underline-offset-4"
            >
              Me prévenir sur ce téléphone
            </button>
          )}
        </>
      )}

      {etat.battery_low && (
        <p className="bg-attention/20 w-full rounded-lg p-3 text-sm">
          Le capteur signale une pile faible : prévoyez son remplacement.
        </p>
      )}
      {etat.surveillance === "limitee" && (
        <p className="bg-attention/20 w-full rounded-lg p-3 text-sm">
          Le capteur transmet moins d&apos;une fois par heure : surveillance
          limitée. Réglez l&apos;émission sur une heure au plus.
        </p>
      )}
      {erreurReseau && (
        <p className="text-muted-foreground text-sm">
          Connexion instable : nouvel essai dans quelques secondes.
        </p>
      )}

      <Link
        href="/pose"
        className={cn(
          buttonVariants({ variant: "outline" }),
          "h-12 w-full text-base",
        )}
      >
        {affichage.etape === "feu_vert" ? "Terminer" : "Revenir plus tard"}
      </Link>
    </div>
  );
}
