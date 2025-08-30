# SportFever WhatsApp Bot

Bot d’accueil pour groupes WhatsApp (Baileys).

## Prérequis
- Node 20+
- Compte Render (si hébergement géré)
- Accès au groupe WhatsApp cible

## Variables d’environnement
- `GROUP_NAME` : nom EXACT du groupe à surveiller
- `RULES_URL`  : lien règles/planning
- `AUTH_DIR`   : dossier de session Baileys (par défaut `./auth`)

## Local
```bash
npm ci
npm start
