# Questions et actions en attente de Rayan

Chaque point est contourné dans le code par un bouchon marqué
`TODO(RAYAN)` ; le travail continue sur ce qui n'en dépend pas.

## Ouverts

1. **Base vierge pour vérifier les migrations** — le poste n'a ni Docker ni
   CLI Supabase, et il n'existe qu'un projet Supabase (développement). Les
   migrations sont appliquées sur ce projet, par-dessus l'existant. Pour
   vérifier « sur base vierge », il faudra soit installer Docker + CLI
   Supabase (`supabase start` puis `supabase db reset`), soit utiliser le
   futur projet de production (phase 10).
2. **Accès superadmin** — le compte `dev-superadmin` est supprimé et aucun
   superadmin n'existe plus sur la base de développement. Pour retrouver
   l'espace `/admin` : exécuter `scripts/grant-superadmin.sql` avec votre
   adresse dans l'éditeur SQL de Supabase (le compte doit exister).
3. **Google** — créer les identifiants OAuth (Google Cloud Console) et
   activer le fournisseur Google dans Supabase. En attendant, le bouton
   « Continuer avec Google » affiche un message d'indisponibilité.
4. **Turnstile** — créer les clés Cloudflare Turnstile
   (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`). Sans elles,
   la case anti-robot de l'inscription est ignorée.
5. **Orthographe de la marque** — « SmartMetera » (plan) ou
   « SmartMeteria » (écrans Réseau, domaine) ? Centralisé dans
   `NOM_PLATEFORME` (`src/lib/marque.ts`).
6. **Mots de passe divulgués** — activer la protection dans le tableau de
   bord Supabase (Authentication > Sign In / Providers > Email > « Prevent
   use of leaked passwords »). Action manuelle, signalée par l'avis de
   sécurité Supabase depuis que la connexion par mot de passe existe.
7. **Prix de l'eau au Maroc** — aucun prix par défaut en dirhams : chaque
   site marocain doit recevoir son prix au m³ (sinon aucun montant n'est
   calculé). Un prix moyen de référence peut être ajouté dans
   `platform_settings` (clé `prix_eau_defaut`, valeur `MAD`).
8. **Tarifs marocains à compléter** — mise en service du premier point
   avec passerelle, point supplémentaire et sonde de température : « à
   paramétrer » dans le plan, laissés vides dans `platform_settings`
   (clé `tarifs`, valeur `MAD`).
9. **Broker MQTT du kit A** — choisir un broker managé dans l'Union
   européenne (conditions dans `docs/reception-mqtt.md`), créer la règle de
   transfert HTTP vers l'adresse « MQTT » de l'onglet « Réception des
   capteurs », puis envoyer une vraie trame reçue pour confirmer les noms
   de champs du transfert (l'application accepte déjà `clientid` +
   `payload`, le message seul et le format Orange Live Objects).
10. **Serveur LoRaWAN** — héberger ChirpStack (guide
    `infra/chirpstack/README.md`) ou ouvrir un compte The Things Stack
    Cloud ; y saisir l'adresse « LoRaWAN ». Maroc : vérifier la bande de
    fréquences et les agréments ANRT avant la pose.
11. **Sonde de température** — choisir le modèle ; son décodeur (fourni
    par le fabricant) doit être chargé dans le serveur LoRaWAN et produire
    un champ `temperature` en °C (sinon, indiquer le nom du champ).
12. **Réglage des EM300-DI** — confirmer l'intervalle d'émission des
    capteurs livrés (60 minutes au plus) pour annoncer l'heure de la
    première donnée dans l'assistant de pose (`src/lib/gardien/modeles.ts`).
13. **Trames réelles** — envoyer quelques trames réelles de chaque capteur
    (elles sont aussi visibles dans « trames d'appareils inconnus » si le
    capteur n'est pas encore dans le stock) pour les ajouter aux tests.
14. **Notification de première donnée** — l'assistant prévient sur le
    téléphone tant que la page reste ouverte ; l'envoi par SMS ou e-mail
    quand la page est fermée arrive avec l'interface `notify()` (phase G5).
15. **Températures d'eau chaude** — vérifier dans les textes les seuils
    par type de point (55 °C en sortie de production et 50 °C sur la
    boucle de retour, valeurs du plan ; point éloigné : vide) et le délai
    des analyses avant la réouverture d'un site fermé (vide : aucun rappel
    n'est envoyé tant qu'il n'est pas renseigné). Réglages dans
    `platform_settings`, clé `temperatures`.
16. **Seuils de détection à valider sur le terrain** — valeurs du plan
    (fuite de nuit, débit continu, rupture, fermeture, capteur muet) dans
    `platform_settings`, clé `seuils` ; à ajuster après les premiers
    pilotes, sans nouvelle version du code.
