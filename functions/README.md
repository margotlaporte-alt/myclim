# MyCLIM Functions

Fonctions Firebase pour les emails transactionnels MyCLIM. Le backend peut maintenant envoyer les mails soit via `Microsoft Graph`, soit via `SMTP`.

## Transport recommandé

Pour un backend Node.js simple, utiliser `MAIL_TRANSPORT=smtp` avec Microsoft 365 (`smtp.office365.com`).

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

## Mise en place

1. Copier `functions/.env.example` en `functions/.env`
2. Définir les variables SMTP Microsoft 365
3. Vérifier que le compte `SMTP_USER` peut envoyer les emails attendus
4. Lancer l'émulateur ou déployer les functions Firebase
