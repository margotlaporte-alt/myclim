# WA Service

Microservice Node.js qui récupère les performances d'athlètes depuis World Athletics via leur API GraphQL interne, avec cache SQLite et synchronisation quotidienne.

---

## Stack

| Composant | Choix |
|-----------|-------|
| Runtime | Node.js 20+ |
| HTTP | Express 4 |
| Cache | SQLite via `better-sqlite3` |
| Cron | `node-cron` |
| Infra | Docker / docker-compose |

---

## Démarrage rapide

```bash
cp .env.example .env
npm install
npm start
# → http://localhost:3001
```

Avec Docker :
```bash
docker-compose up -d
```

---

## Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `PORT` | `3001` | Port du serveur |
| `CACHE_TTL_SECONDS` | `21600` | Durée de validité du cache (6 h) |
| `SYNC_CRON` | `0 3 * * *` | Heure du sync quotidien (3h du matin) |
| `API_KEY` | _(vide)_ | Clé d'accès optionnelle (header `x-api-key`) |
| `DB_PATH` | `./data/wa_cache.db` | Chemin de la base SQLite |

---

## Endpoints

### `GET /health`
```json
{ "status": "ok", "service": "wa-service", "time": "2026-05-06T12:00:00.000Z" }
```

### `GET /athlete/:waid/performances`
Retourne PBs et SBs pour un athlète. Fetch live si pas en cache.

```bash
curl http://localhost:3001/athlete/14204603/performances
```

**Réponse :**
```json
{
  "waid": 14204603,
  "firstName": "Armand",
  "lastName": "Duplantis",
  "source": "cache",
  "personalBests": [
    {
      "discipline": "Pole Vault",
      "disciplineCode": "PV",
      "mark": "6.26",
      "wind": null,
      "notLegal": false,
      "date": "2024-09-17",
      "venue": "Brussels, Belgium",
      "resultScore": null
    }
  ],
  "seasonBests": [
    {
      "discipline": "Pole Vault",
      "disciplineCode": "PV",
      "mark": "6.25",
      "wind": null,
      "notLegal": false,
      "date": "2024-08-05",
      "venue": "Paris, France",
      "resultScore": null
    }
  ]
}
```

### `GET /athlete/:waid/pb?discipline=100m`
Personal bests seulement. Filtre optionnel par discipline.

### `GET /athlete/:waid/sb?discipline=60m`
Season bests seulement. Filtre optionnel par discipline.

### `GET /athlete/:waid`
Données complètes (infos + perfs).

### `POST /athlete/:waid/sync`
Force un re-fetch depuis World Athletics (bypasse le cache TTL).

### `POST /sync/all`
Lance un sync de tous les WAIDs en base (répond immédiatement, tourne en arrière-plan).

### `GET /athletes`
Liste tous les WAIDs en cache.

### `DELETE /athlete/:waid`
Supprime un athlète du cache.

---

## Schéma SQL

```sql
CREATE TABLE athletes (
  waid          INTEGER PRIMARY KEY,
  url_slug      TEXT,
  first_name    TEXT,
  last_name     TEXT,
  birth_date    TEXT,
  gender        TEXT,
  disciplines   TEXT,   -- JSON
  fetched_at    INTEGER -- unix timestamp
);

CREATE TABLE performances (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  waid            INTEGER REFERENCES athletes(waid) ON DELETE CASCADE,
  type            TEXT,   -- 'PB' | 'SB'
  discipline      TEXT,
  discipline_code TEXT,
  mark            TEXT,
  wind            TEXT,
  not_legal       INTEGER,
  perf_date       TEXT,
  venue           TEXT,
  result_score    REAL
);
```

---

## Intégration MyCLIM

Depuis le frontend React :

```js
const response = await fetch(`http://localhost:3001/athlete/${waid}/performances`);
const { personalBests, seasonBests } = await response.json();
```

En production, faire appel via une Netlify Function pour ne pas exposer l'URL du service.

---

## Stratégie de cache & résilience

| Situation | Comportement |
|-----------|-------------|
| Cache frais (< TTL) | Retourne le cache immédiatement |
| Cache expiré | Fetch live → met à jour le cache |
| WA indisponible, cache expiré | Retourne le cache périmé avec `"source": "stale"` |
| WA indisponible, pas de cache | `502 Bad Gateway` |

---

## Notes sur l'API World Athletics

- L'endpoint GraphQL `https://graphql-prod-4.athleticswa.com/graphql` est celui utilisé par le site officiel.
- Aucune authentification requise pour les données publiques.
- Le service tente deux formes de requête (`v1` / `v2`) en cas d'échec.
- Un délai de 500 ms est appliqué entre les requêtes lors du sync groupé.
