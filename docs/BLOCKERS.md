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
5. ~~**Orthographe de la marque**~~ — résolu le 29 septembre 2026 :
   « SmartMeteria » partout (`NOM_PLATEFORME`, écrans, e-mails, documents ;
   message de la base corrigé par la migration `0045`).
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
14. ~~**Notification de première donnée**~~ — résolu en phase G5 : la
    fonction `gardien-envois` prévient le technicien par e-mail et SMS
    (journalisés tant que l'envoi réel n'est pas activé, voir 17 et 18).
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
17. **Fournisseurs SMS, appel vocal et WhatsApp** — branché en phase G10 :
    Twilio (un seul compte pour les trois canaux), désactivé tant que ses
    clés manquent (`src/lib/gardien-envois/telephone.ts`, marqué
    `TODO(RAYAN)`). À confirmer, ou à remplacer par un autre fournisseur
    (Brevo, OVH, Vonage…) : l'adaptateur est petit. Ouverture du compte,
    numéro français et modèle WhatsApp : `docs/MISE_EN_LIGNE.md`, étape 13.
    Texte du modèle WhatsApp proposé, à faire valider par Meta.
18. **Activer les vrais envois d'e-mails du Gardien** — secrets de la
    fonction `gardien-envois` dans Supabase (Edge Functions > Secrets) :
    `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (domaine vérifié chez Resend),
    `GARDIEN_URL_APP` (adresse publique de l'application) et
    `GARDIEN_ENVOIS_MODE` (`redirection` + `GARDIEN_EMAIL_REDIRECT` pour
    recevoir tous les messages sur une adresse de test ; `reel` en
    production seulement). Sans ces secrets, tout reste journalisé.
19. **Critères eau de la Clef Verte** — à vérifier auprès de Teragir
    (plan, section 6, point 7). Le rapport mensuel donne les litres par
    nuitée, sans seuil ni jugement tant que les critères ne sont pas
    confirmés.
20. **Heure du Maroc sur le serveur** — la base horaire la plus récente
    (2026c) place le Maroc à GMT+0 depuis le 20 septembre 2026. Les calculs
    suivent la base horaire du serveur ; à vérifier sur le premier site
    marocain (la nuit de 2 h à 5 h doit correspondre à l'heure locale).
21. **Rapports sur la base de développement** — la tâche planifiée tourne
    aussi en développement : vos sites d'essai reçoivent leurs rapports
    (première nuit, première semaine, mensuel) et leurs alertes dans le
    journal des envois. Rien ne part réellement (mode « journal »).
22. **Accord écrit de conversion d'un pilote** — la phrase que le client
    coche sur la page de son site (« J'accepte que la surveillance
    continue avec l'abonnement à la fin du pilote… ») est à faire valider
    avec les conditions de pilote (plan, section 6, point 11). Composant
    `ConsentementPilote`, marqué `TODO(RAYAN)`.
23. **Facturation pendant un pilote** — l'export d'usage compte les
    abonnements des sites en pilote et les signale (colonne « Sites en
    pilote ») : décider s'ils sont facturés, offerts ou remboursés.

## Ajoutés en phase G10 (mise en ligne)

24. **Durée de conservation des messages** — réglage `conservation` de
    `platform_settings` : `envois_mois` est vide (rien n'est effacé).
    Indiquez la durée au-delà de laquelle le destinataire et le contenu des
    messages sont effacés (la ligne reste : date, canal, statut). Les
    relevés ne sont jamais supprimés.
25. **Comptes et clés de production** — à créer par vous, dans l'ordre de
    `docs/MISE_EN_LIGNE.md` : projet Supabase de production à Paris (offre
    Pro pour les sauvegardes), Vercel, domaine d'envoi chez Resend, Sentry
    (région européenne), Cloudflare Turnstile, identifiants Google,
    Twilio, broker MQTT, serveur LoRaWAN, pointage de
    `app.smartmeteria.com`. Aucun compte n'a été créé et aucune base de
    production n'a été touchée.
26. **Mise en ligne = fusion vers `main`** — Vercel publie la branche
    `main`. La fusion de `feat/gardien` dans `main` est votre décision
    (demande de fusion sur GitHub), jamais faite automatiquement.
27. **Pages légales et registre des traitements** — six modèles « à faire
    valider » (`/legal` : mentions légales, CGU, CGV professionnelles avec
    obligation de moyens, conditions du pilote, confidentialité, accord de
    sous-traitance) et `docs/REGISTRE_TRAITEMENTS.md`. À faire relire par
    un juriste ; donnez les informations de l'entité (raison sociale,
    forme, capital, siège, immatriculation, TVA, directeur de la
    publication, contact, contact données personnelles) : elles vont dans
    `INFORMATIONS_LEGALES` (`src/lib/legal/documents.ts`) et le bandeau
    « Modèle à faire valider » sera retiré. Points ouverts dans les textes :
    plafond de responsabilité, délai de paiement, reconduction et préavis,
    droit applicable (France et Maroc), retenue à la source, matériel
    (vente ou mise à disposition), sort du matériel après un pilote,
    garanties de transfert hors Union européenne de chaque sous-traitant.
28. **Adresse d'expédition des e-mails** — proposée :
    `SmartMeteria <alertes@smartmeteria.com>`. À confirmer (une autre
    adresse ou un sous-domaine d'envoi est possible).
29. **Sentry : piles d'appels du navigateur lisibles** — les erreurs
    partent sans dépendance supplémentaire (envoi direct, masquage maison),
    donc sans « source maps » : les erreurs du navigateur montrent un code
    compacté, plus difficile à lire (celles du serveur le sont moins).
    Si cela gêne, ajouter `@sentry/nextjs` (dépendance lourde) : à décider
    plus tard, après quelques semaines d'exploitation.
