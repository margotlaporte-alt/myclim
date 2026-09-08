# MyCLIM Functions

Fonctions Firebase pour les emails transactionnels MyCLIM. Le backend peut maintenant envoyer les mails soit via `Microsoft Graph`, soit via `SMTP`.

## Transport recommandé

Utiliser `MAIL_TRANSPORT=graph` avec une app Azure AD (permission `Mail.Send`) plutôt que le SMTP classique. Microsoft désactive progressivement l'authentification SMTP basique (compte + mot de passe), et une boîte partagée comme `events@fla.lu` n'a en général pas de mot de passe de connexion direct. Graph fonctionne sans mot de passe de boîte mail et sans dépendre de la MFA.

`MAIL_TRANSPORT=smtp` reste disponible en repli si l'authentification SMTP est explicitement activée pour la boîte utilisée.

## Variables d'environnement

### Obligatoires pour tous les cas

- `APP_BASE_URL`
- `MAIL_TRANSPORT`

### Si `MAIL_TRANSPORT=smtp`

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM` (optionnel)

### Si `MAIL_TRANSPORT=graph`

- `MICROSOFT_GRAPH_TENANT_ID`
- `MICROSOFT_GRAPH_CLIENT_ID`
- `MICROSOFT_GRAPH_CLIENT_SECRET`
- `MICROSOFT_GRAPH_SENDER`
- `MICROSOFT_GRAPH_FROM` (optionnel, sinon `MICROSOFT_GRAPH_SENDER` est utilisé)

## Fichier `.env`

Copier `functions/.env.example` vers `functions/.env`, puis remplacer les valeurs d'exemple par vos identifiants SMTP Microsoft 365.

## Flux préparés

- Traitement automatique de `mailQueue`
- Réinitialisation de mot de passe via `requestPasswordReset`

## Types de mails actuellement préparés côté front

- création de compte bénévole
- création de compte pré-programme
- attribution de rôle bénévole
- acceptation d'un enfant au pré-programme
- acceptation d'un enfant comme porte-panier

## Mise en place (Microsoft Graph, recommandé)

1. Dans Azure AD (Entra ID) : créer un app registration (ex. « MyCLIM Mailer »)
2. API permissions → Microsoft Graph → Application permissions → `Mail.Send` → Grant admin consent
3. Certificates & secrets → créer un client secret, noter sa valeur (affichée une seule fois)
4. Noter le Tenant ID et l'Application (client) ID
5. Restreindre l'app à `events@fla.lu` uniquement via une Application Access Policy Exchange Online (sinon l'app peut envoyer au nom de n'importe quelle boîte du tenant) :
   ```powershell
   New-DistributionGroup -Name "MailerScope" -Type Security -Members events@fla.lu
   New-ApplicationAccessPolicy -AppId <client-id> -PolicyScopeGroupId MailerScope -AccessRight RestrictAccess -Description "MyCLIM mailer, events@fla.lu only"
   ```
6. Copier `functions/.env.example` en `functions/.env`, définir `MAIL_TRANSPORT=graph` et les variables `MICROSOFT_GRAPH_*` (tenant, client id/secret, `MICROSOFT_GRAPH_SENDER=events@fla.lu`)
7. Lancer l'émulateur ou déployer les functions Firebase, et configurer les mêmes variables dans les paramètres d'environnement Netlify (utilisées par `netlify/functions/send-transactional-mail.mjs`, le chemin réellement appelé par l'app)

## Mise en place (SMTP, repli)

1. Copier `functions/.env.example` en `functions/.env`
2. Définir les variables SMTP Microsoft 365
3. Dans le centre d'administration Exchange, activer « Authenticated SMTP » pour la boîte utilisée par `SMTP_USER`
4. Vérifier que ce compte peut envoyer au nom de `events@fla.lu` (permission « Send As » ou « Send on Behalf » si `SMTP_USER` ≠ `events@fla.lu`), puis définir `SMTP_FROM=events@fla.lu`
5. Lancer l'émulateur ou déployer les functions Firebase
