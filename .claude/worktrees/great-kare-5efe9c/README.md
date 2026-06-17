# MyCLIM

Application React/Vite pour la gestion MyCLIM.

## Mails transactionnels

Les mails metier passent maintenant par une Netlify Function SMTP:

- endpoint: `/.netlify/functions/send-transactional-mail`
- fichier serverless: `netlify/functions/send-transactional-mail.mjs`
- integration front: `src/services/mailQueue.js`

Le reset mot de passe continue a utiliser Firebase Auth.

## Variables Netlify a definir

Dans l'interface Netlify, definir:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Optionnel en local:

- `VITE_MAIL_FUNCTION_URL`

## Lancement local

- front Vite: `npm run dev`
- stack Netlify locale: `npm run netlify:dev`

## Deploiement Netlify

Le projet inclut deja `netlify.toml` avec:

- build command: `npm run build`
- publish directory: `dist`
- functions directory: `netlify/functions`
