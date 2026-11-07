# Mise en ligne du site Point Pneus Guerido

Le site est terminé. Il tourne en **mode démonstration** tant que les comptes ci-dessous n'existent pas :
on peut tout essayer, mais les rendez-vous et les devis ne partent pas au garage
(le formulaire de devis ouvre alors la messagerie du client, comme avant).

Les comptes doivent être ouverts **par le garage, à son nom** (ils engagent la société et, pour deux d'entre eux, un moyen de paiement).
Compter une demi-journée la première fois. Tout se fait dans cet ordre.

| Compte | Sert à | Prix |
|---|---|---|
| Supabase | enregistrer rendez-vous, devis et comptes clients | gratuit pour démarrer |
| Google Cloud | bouton « Continuer avec Google » | gratuit |
| Brevo | e-mails et SMS d'alerte et de confirmation | gratuit jusqu'à 300 e-mails par jour, SMS payants |
| API de plaque | retrouver la voiture avec la plaque | payant, à la recherche ou au mois |

---

## 1. Supabase (base de données)

1. Créer un compte sur <https://supabase.com>, puis **New project** : nom `point-pneus`, région **Europe (Paris ou Francfort)**.
2. **SQL Editor** > **New query** : coller tout le fichier `supabase/schema.sql`, puis **Run**.
3. **Project Settings** > **API** : noter le `Project URL` et la clé `anon` `public`.
   Ne jamais mettre la clé `service_role` dans le site.

## 2. Google (bouton « Continuer avec Google »)

1. <https://console.cloud.google.com> : créer un projet `Point Pneus`.
2. **APIs et services** > **Écran de consentement OAuth** : type *Externe*, nom « Point Pneus Guerido », e-mail du garage.
3. **Identifiants** > **Créer des identifiants** > **ID client OAuth** > *Application Web*.
   URI de redirection autorisée : `https://<projet>.supabase.co/auth/v1/callback`
4. Dans Supabase > **Authentication** > **Providers** > **Google** : activer, coller l'ID client et le code secret.
5. Dans Supabase > **Authentication** > **URL Configuration** :
   - Site URL : `https://www.point-pneus-guerido.com`
   - Redirect URLs : `https://www.point-pneus-guerido.com/reserver.html` et `https://www.point-pneus-guerido.com/garage.html`

## 3. Brevo (alertes et confirmations)

1. Créer un compte sur <https://www.brevo.com>.
2. **Expéditeurs et domaines** : ajouter et valider l'adresse d'envoi (idéalement sur le domaine du site, ex. `rdv@point-pneus-guerido.com`).
3. **SMTP & API** > **Clés API** : créer une clé.
4. Dans Supabase > **Authentication** > **SMTP Settings** : brancher Brevo aussi (serveur `smtp-relay.brevo.com`, port 587),
   pour que les liens de connexion par e-mail partent de l'adresse du garage.

## 4. Installer les deux fonctions serveur

Sur un ordinateur avec Node.js :

```bash
npm install -g supabase
```

```bash
supabase login
```

```bash
supabase link --project-ref <identifiant-du-projet>
```

```bash
supabase functions deploy notify --no-verify-jwt
```

```bash
supabase functions deploy plate-lookup
```

Puis **Edge Functions** > **Secrets**, ajouter :

| Secret | Valeur |
|---|---|
| `BREVO_API_KEY` | la clé Brevo |
| `SENDER_EMAIL` | l'adresse validée dans Brevo |
| `GARAGE_EMAIL` | l'adresse qui reçoit les alertes, ex. `pointpneusguerido@free.fr` |
| `GARAGE_SMS` | facultatif : portable du garage, format `33612345678` |
| `WEBHOOK_SECRET` | un mot de passe long, inventé |
| `SITE_URL` | `https://www.point-pneus-guerido.com` |
| `ALLOWED_ORIGIN` | `https://www.point-pneus-guerido.com` |
| `PLATE_API_URL`, `PLATE_API_KEY` | voir étape 6 |

## 5. Brancher les alertes

Supabase > **Database** > **Webhooks** > **Create a new hook**, deux fois :

1. Table `bookings`, événements **Insert** et **Update**.
2. Table `quote_requests`, événement **Insert**.

Pour les deux : type *Supabase Edge Functions*, fonction `notify`, et un en-tête
`Authorization` = `Bearer <le WEBHOOK_SECRET>`.

Résultat :
- nouveau rendez-vous : e-mail (et SMS) au garage, accusé de réception au client ;
- le garage confirme ou annule dans l'espace garage : le client reçoit un e-mail ;
- nouvelle demande de devis : e-mail (et SMS) au garage.

## 6. API de plaque d'immatriculation

Souscrire chez un fournisseur qui interroge le fichier officiel des cartes grises (SIV).
Avant de payer, vérifier dans sa documentation :
- qu'il renvoie marque, modèle, année, énergie et si possible la taille des pneus ;
- l'hébergement en Europe et le respect du RGPD.

Ajouter ensuite les secrets `PLATE_API_URL` (son adresse, avec `{plate}` à la place de la plaque) et `PLATE_API_KEY`.
Selon le fournisseur : `PLATE_API_KEY_HEADER` (nom de l'en-tête de la clé) et `PLATE_API_KEY_PREFIX` (ex. `Bearer `).
Si la voiture n'est pas reconnue, adapter `mapVehicle()` dans `supabase/functions/plate-lookup/index.ts` à l'exemple de réponse du fournisseur.

Sans cette API, le site marche quand même : le client tape la marque et le modèle.

## 7. Allumer le site

Dans `booking-config.js`, remplacer :

```js
mode: "supabase",
supabaseUrl: "https://<projet>.supabase.co",
supabaseAnonKey: "<clé anon>",
```

## 8. Mettre en ligne

Envoyer sur l'hébergement (OVH) tous les fichiers **sauf** `GUIDE-RESERVATION.md` et le dossier `supabase/`.

## 9. Donner l'accès garage

1. Ouvrir `https://www.point-pneus-guerido.com/garage.html` et se connecter.
2. Supabase > **SQL Editor** :

```sql
insert into public.admins (user_id)
  select id from auth.users where email = 'pointpneusguerido@free.fr';
```

3. Recharger `garage.html` : rendez-vous, demandes de devis et blocage de créneaux apparaissent.

---

## Réglages choisis (modifiables)

Dans `booking-config.js` :
- horaires : lundi au vendredi, 8 h à 12 h et 14 h à 18 h 30 ; jours fériés fermés ;
- délai minimum avant un rendez-vous en ligne : 1 h 30 ;
- durées : 1 pneu 20 min, 2 pneus 30 min, 4 pneus 45 min, crevaison 30 min, géométrie 1 h, clim 1 h, vidange 1 h, freins 1 h 30, autre 1 h ;
- congés : liste `closedDates`, ou plus simplement « Bloquer un créneau » dans l'espace garage.

Dans Supabase, table `garage_settings` : 2 voitures en même temps.
Les horaires sont aussi vérifiés dans `create_booking` (`supabase/schema.sql`) : les changer aux deux endroits.

Choix faits : paiement au garage (pas de prépaiement en ligne), compte client facultatif,
annulation en ligne jusqu'à 2 h avant, 3 rendez-vous à venir maximum par numéro de téléphone.
Les données sont effacées automatiquement selon les durées de la page `confidentialite.html`.
