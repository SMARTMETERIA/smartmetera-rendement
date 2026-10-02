# Guide d'exploitation (RUNBOOK)

Que faire, pas à pas, quand il faut déployer, revenir en arrière ou réagir
à un incident. Pour la toute première mise en ligne : `docs/A_FAIRE_RAYAN.md` (partie « Réglages »).

Règle d'or : **ne jamais supprimer de relevés**, **ne jamais envoyer
directement sur `main`**, et **toujours vérifier dans l'onglet
« Surveillance » après une intervention**.

---

## 1. Où regarder

| Question | Où |
|---|---|
| Les tâches automatiques tournent-elles ? | Espace superadmin > **Surveillance** (« À l'heure », « En retard », « En échec ») et le récapitulatif quotidien de 7 h |
| Un message est-il parti ? | Espace de l'organisation > **Journal des envois** (statut : envoyé, journalisé, échec, avec la raison) |
| Une page plante-t-elle ? | Sentry (erreurs masquées, avec la référence affichée à l'utilisateur) ; Vercel > Logs |
| Une fonction a-t-elle échoué ? | Supabase > Edge Functions > *nom* > Logs |
| Un capteur transmet-il ? | Superadmin > **Réception des capteurs** (trames d'appareils inconnus) ; **Flotte** (dernier message, pile, radio) |
| Une tâche pg_cron a-t-elle échoué ? | SQL : `select * from cron.job_run_details order by start_time desc limit 20;` |

## 2. Déployer une nouvelle version

1. Le travail est sur la branche `feat/gardien`, tests verts
   (`npm run typecheck:fonctions`, `npx tsc --noEmit`, `npm run lint`,
   `npm test`).
2. **Base** (si de nouvelles migrations existent) : `npx supabase link
   --project-ref <production>` puis `npx supabase db push`. Les migrations
   ne font qu'ajouter : jamais de suppression de relevés.
3. **Fonctions** modifiées : `npx supabase functions deploy <nom>`
   (`--no-verify-jwt` uniquement pour `ingest` et `inbound-email`). Avant,
   `node scripts/synchroniser-ingest.mjs` (copie des modules testés ; le
   test `ingest-synchro` échoue si elle manque).
4. **Site** : sur GitHub, demande de fusion de `feat/gardien` vers `main`,
   puis « Merge ». Vercel met en ligne tout seul.
5. Vérifier : `npm run fumee -- https://app.smartmeteria.com --env
   .env.production.local`, puis l'onglet **Surveillance**.

## 3. Revenir en arrière

- **Site** : Vercel > Deployments > la version précédente > **Promote to
  Production** (immédiat, sans reconstruire).
- **Fonction** : `git checkout <commit précédent> -- supabase/functions/<nom>`
  puis `npx supabase functions deploy <nom>`, puis revenir à la branche.
- **Base** : on ne « défait » pas une migration. On écrit une nouvelle
  migration qui corrige. En dernier recours, restauration (section 9).

## 4. Ajouter un partenaire (marque blanche)

1. Le partenaire crée son compte depuis `/inscription` (ou vous le créez
   avec son adresse) : son organisation démarre en essai de 30 jours.
2. Superadmin > organisation > **Facturation** : statut (essai, actif,
   suspendu), prix par point du partenaire, remise fondateur et, au Maroc,
   retenue à la source (champs réservés au superadmin).
3. L'administrateur du partenaire règle **Ma marque** (logo, couleurs, nom
   d'expéditeur, adresse de réponse) et donne à ses clients l'adresse de
   connexion `/p/<slug>/connexion` affichée sur cette page.
4. Vérifier : créer une page preuve de démonstration, elle porte la marque
   du partenaire.

## 5. Envois : incident e-mail

Symptôme : lignes « échec » dans le **Journal des envois**, ou e-mails non
reçus.

1. Lire la raison de l'échec dans le journal (ex. « Resend a répondu 403 »).
2. Resend > **Domains** : le domaine est-il toujours « Verified » ? Resend >
   **Logs** : l'e-mail a-t-il été refusé par le destinataire ?
3. Clé révoquée ou expirée : créer une nouvelle clé, la remplacer dans
   Vercel (`RESEND_API_KEY`, redéployer) et dans Supabase > Edge Functions >
   Secrets.
4. Besoin de couper les envois le temps de comprendre : Supabase > Edge
   Functions > Secrets, `GARDIEN_ENVOIS_MODE` = `journal`. Rien n'est
   perdu : tout continue d'être écrit dans le journal.
5. Vérifier : **Surveillance > Message de test**.

## 6. Envois : incident SMS, appel ou WhatsApp

1. Journal des envois : raison de l'échec (ex. « Twilio a répondu 400
   (21211 …) » = numéro invalide ; 401 = clé erronée ; 21610 = le
   destinataire a répondu STOP).
2. Twilio > **Monitor > Logs** pour le détail.
3. Numéro invalide : la personne corrige son numéro dans **Mon compte**
   (format `+33…`).
4. Vérifier : **Surveillance > Message de test** avec le canal concerné.

## 7. Tâche planifiée en retard ou en échec

1. Onglet **Surveillance** : le détail de l'erreur est sous la tâche.
2. Supabase > Edge Functions > `gardien-moteur` ou `gardien-envois` > Logs.
3. Si l'appel ne part pas du tout : vérifier les secrets du coffre (SQL :
   `select name from vault.secrets;` doit lister `functions_base_url` et
   `anon_key`) et les extensions `pg_cron` et `pg_net`.
4. Relancer à la main (SQL Editor) :
   `select public.cron_appeler_edge_function('gardien-moteur');` ou
   `'gardien-envois'`. Rien n'est envoyé deux fois (journal unique par
   destinataire) et les fuites ne sont jamais créées en double.
5. Vérifier : la tâche repasse « À l'heure » au passage suivant.

## 8. Capteurs muets ou données absentes

1. **Flotte** : dernier message, pile, radio du capteur.
2. **Réception des capteurs** : si le capteur apparaît dans « trames
   d'appareils inconnus », sa référence (IMEI ou DevEUI) n'est pas dans le
   stock : l'ajouter dans **Appareils**.
3. Rien du tout : vérifier le broker MQTT (kit A) ou le serveur LoRaWAN
   (kit C) et la passerelle (alimentation, 4G).
4. Jeton de réception divulgué : en générer un nouveau (SQL ci-dessous),
   puis mettre à jour l'adresse dans le broker et dans le serveur LoRaWAN
   (onglet **Réception des capteurs**). Les anciens messages restent.

```sql
update public.platform_settings
set value = jsonb_build_object(
  'jeton_mqtt', encode(extensions.gen_random_bytes(24), 'hex'),
  'jeton_lorawan', encode(extensions.gen_random_bytes(24), 'hex'))
where key = 'reception';
```

## 9. Restauration de la base

À n'utiliser qu'en cas de perte de données (suppression accidentelle,
corruption). Une restauration **écrase** tout ce qui a été écrit depuis.

1. Prévenir les clients (les alertes seront suspendues pendant
   l'opération).
2. Supabase > **Database > Backups** : choisir la sauvegarde quotidienne
   (ou, si l'option *Point in Time Recovery* est activée, l'heure exacte).
3. Après restauration : vérifier les tâches (**Surveillance**), puis
   relancer le moteur (section 7, point 4).
4. Les relevés reçus pendant la coupure sont renvoyés par la plupart des
   capteurs (historique) ; sinon, import CSV de secours depuis le portail
   du fabricant.

## 10. Clé secrète divulguée

Remplacer la clé, puis la mettre partout où elle sert :

| Clé | Où la renouveler | Où la remplacer |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Project Settings > API (nouvelles clés) | Vercel |
| `RESEND_API_KEY` | Resend > API Keys | Vercel, secrets des fonctions |
| `TWILIO_AUTH_TOKEN` | Twilio > Account > API keys & tokens | secrets des fonctions |
| `TURNSTILE_SECRET_KEY` | Cloudflare > Turnstile > *site* > Rotate | Vercel |
| `SENTRY_DSN` | Sentry > Client Keys > *Generate New Key* | Vercel |
| Jetons de réception | section 8 | broker MQTT, serveur LoRaWAN |

Après chaque remplacement dans Vercel : Deployments > Redeploy.

## 11. Demandes sur les données personnelles

- **Une personne demande ses données ou leur effacement** : l'administrateur
  de son organisation retire son accès (**Équipe**) ; pour un effacement
  complet du compte, Supabase > Authentication > Users > supprimer.
- **Un client part** : superadmin > organisation > **Exporter** (fichier
  complet), puis **Supprimer** (la suppression exige un export de moins de
  24 heures).
- **Durée de conservation** : réglage `conservation` de `platform_settings`
  (contenu et destinataire des messages effacés après `envois_mois` mois ;
  la purge tourne chaque nuit à 3 h 40).
