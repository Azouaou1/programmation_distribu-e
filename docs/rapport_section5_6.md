# Sections 5 & 6 — Rapport Neurovent

---

## 5. Backend Node.js & Analyse Comparative *(~1 page)* — 3 pts

### 5.1 Présentation du backend Node.js

#### 5.1.1 Stack et structure

Le backend Node.js constitue la seconde implémentation de l'API Neurovent, développée en parallèle du backend Django dans un objectif de comparaison technologique. Il repose sur **Express.js 4**, **Sequelize 6** comme ORM, et **SQLite** en développement (avec basculement automatique vers **PostgreSQL** en production via la variable `DATABASE_URL`).

L'architecture suit un pattern **MVC strict**, organisé autour des dossiers suivants :

```
backend-node/
├── app.js                  ← Configuration Express (CORS, routes, error handlers)
├── server.js               ← Point d'entrée (sync DB, création compte admin)
└── src/
    ├── config/
    │   ├── database.js     ← Sequelize : SQLite dev / PostgreSQL prod
    │   └── email.js        ← Nodemailer (SMTP Gmail)
    ├── models/             ← User, Event, Registration, Tag, BlacklistedToken
    ├── middleware/
    │   ├── auth.js         ← Vérification JWT + blacklist
    │   ├── permissions.js  ← Guards par rôle (requireParticipant, requireCompany…)
    │   └── upload.js       ← Multer (logos, bannières, documents)
    ├── controllers/        ← Logique métier par domaine (auth, events, registrations…)
    ├── routes/             ← Déclaration des endpoints REST
    ├── services/
    │   ├── emailService.js   ← Centralisation Nodemailer (≡ emails.py Django)
    │   ├── sireneService.js  ← Vérification SIRET via API Annuaire Entreprises
    │   └── tokenBlacklist.js ← Blacklist des refresh tokens au logout
    └── tests/              ← Suite Jest + Supertest
```

Contrairement à Django qui repose sur un cadre très intégré (ORM + sérialiseurs + vues + permissions en classes), Express expose une architecture intentionnellement **plus explicite** : chaque middleware, chaque validation, chaque gestion d'erreur est écrit manuellement dans les contrôleurs.

#### 5.1.2 Modèles de données

Les quatre modèles Sequelize reproduisent fidèlement la structure Django :

**`User`** — modèle unique pour les trois rôles (`PARTICIPANT`, `COMPANY`, `ADMIN`). Il embarque tous les champs des deux profils (avatar, bio, domaine favori, liens pour les participants ; logo, SIRET, statut de vérification, représentant légal pour les organizations). Le hachage du mot de passe est géré automatiquement via des hooks Sequelize `beforeCreate` / `beforeUpdate` avec bcryptjs (coût 12). Des méthodes d'instance exposent les helpers métier : `checkPassword()`, `setPassword()`, `toPublicJSON()`, `getDisplayName()`.

**`Event`** — modèle riche avec les mêmes 30+ champs que le backend Django : statuts (`DRAFT`, `PUBLISHED`, `CANCELLED`), format, mode d'inscription, capacité, visibilité différée de l'adresse et du lien en ligne, suivi des notifications email. Des **méthodes d'instance calculées** reproduisent la logique des propriétés Python : `isRegistrationOpen()`, `getSpotsRemaining()`, `getVisibleAddress()`, `getVisibleOnline()`.

**`Registration`** — relation Many-to-Many centrale entre `User` (participant) et `Event`. Les cinq statuts du cycle de vie sont présents (`PENDING`, `CONFIRMED`, `REJECTED`, `CANCELLED`, `WAITLIST`). La contrainte `unique_together` est implémentée via un index Sequelize :

```js
indexes: [
  { unique: true, fields: ['participant_id', 'event_id'], name: 'unique_participant_event' }
]
```

**`Tag`** — taxonomie des événements et des profils participants, utilisée pour le moteur de recommandation.

#### 5.1.3 Authentification et permissions

L'authentification repose sur **`jsonwebtoken`** avec les mêmes paramètres que Django : access token de 2h, refresh token de 7 jours, claims personnalisés selon le rôle :

```json
// Participant
{ "user_id": 1, "role": "PARTICIPANT", "email": "...", "first_name": "...", "last_name": "..." }

// Organization
{ "user_id": 2, "role": "COMPANY", "company_name": "...", "company_identifier": "..." }
```

Le logout **blackliste le refresh token** via un service dédié (`tokenBlacklist.js`), vérifié à chaque requête entrante dans le middleware `authenticate`.

Les **permissions par rôle** sont implémentées comme des middlewares fonctionnels chaînables, à l'image des classes DRF côté Django :

```js
// permissions.js
function requireCompany(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentification requise.' });
  if (req.user.role !== 'COMPANY') return res.status(403).json({ error: 'Réservé aux organisations.' });
  next();
}
```

Un middleware `optionalAuthenticate` permet de différencier les réponses selon que l'utilisateur est connecté ou non (ex : détail event public vs connecté).

#### 5.1.4 Fonctionnalités implémentées

L'ensemble des endpoints du backend Django est reproduit à l'identique :

- **Authentification complète** : inscription participant/company, login séparé, refresh, logout avec blacklist, reset mot de passe par email signé, upload de document justificatif
- **CRUD événements** avec les mêmes filtres (format, tags, dates, ville, pays, recherche textuelle, ordering, pagination 10/page)
- **Gestion des inscriptions** avec l'intégralité de la logique métier : mode AUTO (confirmation immédiate ou waitlist), mode VALIDATION (PENDING + review manuelle), promotion automatique depuis la liste d'attente, réinscription après annulation (réactivation sans doublon en base), besoins d'accessibilité
- **Notifications email** centralisées dans `emailService.js` : confirmation, waitlist, rejet, suppression par l'organisateur, annulation d'événement, mise à jour, reset mot de passe, résultat vérification SIRENE, alertes de capacité
- **Vérification SIRENE** via l'API Annuaire Entreprises (`api.annuaire-entreprises.data.gouv.fr`) avec comparaison de similarité de nom (seuil 70%, bibliothèque `string-similarity`)
- **Dashboard organization** : métriques agrégées (fill rate, cancellation rate, vues totales), exports CSV résumé et performance via requêtes SQL brutes
- **Espace admin** : modération des utilisateurs (suspend/activate/delete RGPD), vérification des organizations, liste et suppression des événements, statistiques globales
- **Documentation API** via Swagger UI (`swagger-jsdoc` + `swagger-ui-express`) disponible sur `/api/docs/`
- **Rate limiting** via `express-rate-limit` pour protéger les endpoints d'authentification
- **Upload fichiers** via Multer (logos companies, bannières événements, documents de vérification)

#### 5.1.5 Tests

La suite de tests Jest + Supertest couvre quatre fichiers :

| Fichier | Domaine | Cas couverts (sélection) |
|---|---|---|
| `auth.test.js` | Authentification | Inscription, login, profil, changement mdp, suppression RGPD, modération admin |
| `events.test.js` | Événements | CRUD, filtres, stats, permissions par rôle, dashboard |
| `registrations.test.js` | Inscriptions | Mode AUTO, mode VALIDATION, waitlist, promotion, export CSV, permissions |
| `tags.test.js` | Tags | CRUD, association profil, recommandations |

Les tests utilisent une base SQLite en mémoire (`:memory:`) recréée avant chaque suite via `syncDB()`. Les appels email et SIRENE sont mockés avec `jest.fn()` pour garantir l'isolation. Chaque test couvre non seulement les cas nominaux mais aussi les cas d'erreur et les violations de permissions (ex : une company ne peut pas modifier les inscriptions d'un événement qu'elle ne possède pas → 403/404 attendu).

---

### 5.2 Analyse comparative Django vs Node.js

Les deux backends exposent **le même contrat API REST**, avec les mêmes endpoints, la même logique métier et les mêmes règles de permissions. Cette parité délibérée permet une comparaison technique objective basée sur la façon dont chaque stack résout les mêmes problèmes.

| Critère | Django + DRF | Node.js + Express |
|---|---|---|
| **Productivité** | Très élevée : ORM, sérialiseurs, pagination, filtres, admin en peu de lignes | Élevée mais chaque fonctionnalité est câblée manuellement |
| **Sécurité** | Haute : ORM avec requêtes paramétrées, CSRF, permissions en classes, validations DRF | Correcte : Sequelize paramétré, permissions via middleware, `express-validator` |
| **Modèle de données** | Migrations auto-générées (`makemigrations`) + application (`migrate`) | `sync({ alter: true })` en dev, migration manuelle en prod |
| **Validation** | Sérialiseurs DRF avec validation déclarative par champ | Logique manuelle dans chaque contrôleur |
| **Permissions** | Classes `BasePermission` réutilisables, combinables avec `|` et `&` | Middlewares fonctionnels chaînables, moins composables |
| **Filtres** | `django-filter` : filtres déclaratifs, intégration transparente | Conditions `if/where` manuelles dans les contrôleurs |
| **Pagination** | Intégrée dans DRF, configurable globalement | Implémentée manuellement (limit/offset) |
| **Documentation API** | Swagger + ReDoc auto-générés depuis les sérialiseurs (drf-spectacular) | Swagger via annotations JSDoc dans les routes |
| **Admin intégré** | Django Admin : interface CRUD clés-en-main | Non disponible : endpoints REST custom `/api/auth/admin/` |
| **Tests** | Framework `unittest` intégré, 79+ tests, fixtures Django | Jest + Supertest configurés manuellement |
| **Asynchronisme** | Synchrone par défaut (WSGI), ASGI optionnel | **Asynchrone natif** : toutes les opérations I/O sont non bloquantes |
| **Performance I/O** | Bonne (threads WSGI) | Très bonne (event loop, pas de thread par requête) |
| **Courbe d'apprentissage** | Plus élevée : écosystème riche, conventions fortes à maîtriser | Plus faible pour des développeurs JS full-stack |
| **Flexibilité** | Modérée : les conventions Django orientent fortement l'implémentation | Élevée : architecture entièrement à la main, choix libres |
| **Portabilité base de données** | `dj-database-url` + `DATABASE_URL` → SQLite dev, PostgreSQL prod | `database.js` : SQLite si pas de `DATABASE_URL`, PostgreSQL sinon |

#### Différence fondamentale d'approche

La divergence la plus significative ne concerne pas les performances mais **le niveau d'abstraction**. Côté Django, un sérialiseur DRF déclare une fois les champs, les validations et les permissions — le framework gère ensuite la désérialisation, la validation, la pagination et la sérialisation de la réponse. Côté Node.js, chaque contrôleur contient explicitement toutes ces étapes : validation des paramètres, construction de la requête Sequelize, calcul des champs dérivés, formatage de la réponse.

Ce choix a un coût (plus de code, plus de risque d'incohérence entre endpoints) mais aussi un avantage : **la logique est entièrement transparente**, sans magic implicite, ce qui facilite le débogage et l'adaptation à des cas non standard.

---

### 5.3 Bilan : quand choisir l'un ou l'autre

**Choisir Django + DRF** lorsque :
- Le projet a des règles métier complexes nécessitant validation rigoureuse des données
- L'équipe est mixte (junior/senior) et bénéficie des conventions fortes du framework
- Un backoffice d'administration est nécessaire rapidement (Django Admin)
- La cohérence et la maintenabilité à long terme priment sur la flexibilité immédiate

**Choisir Node.js + Express** lorsque :
- Le projet nécessite des fonctionnalités temps réel (WebSocket, Server-Sent Events) — l'event loop est nativement adapté
- L'équipe est full-JS (partage de code frontend/backend, TypeScript commun)
- L'API est légère avec peu de règles métier complexes
- Les performances sous charge I/O intensive sont critiques

Dans le cas de Neurovent — plateforme avec une logique métier riche (waitlist, vérification SIRENE, cycle de vie des inscriptions, notifications email) — **Django offre un avantage productivité net**. Le backend Node.js démontre néanmoins qu'une parité fonctionnelle complète est atteignable, au prix d'un volume de code plus important.

---

## 6. Déploiement *(~0.5 page)* — 3 pts

### 6.1 Architecture de déploiement

Neurovent est conçu pour être déployé sur **Render**, hébergeur cloud qui supporte nativement les applications Django (Python/Gunicorn) et Node.js, ainsi que des bases PostgreSQL managées.

Le dépôt contient un fichier `render.yaml` dans `backend-node/` qui déclare l'ensemble de l'infrastructure Node.js en tant que code :

```yaml
services:
  - type: web
    name: neurovent-backend
    env: node
    buildCommand: npm install
    startCommand: node server.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
      - key: DATABASE_URL
        fromDatabase:
          name: neurovent-db
          property: connectionString
      - key: JWT_SECRET
        generateValue: true        # Généré automatiquement par Render

databases:
  - name: neurovent-db
    databaseName: neurovent
    user: neurovent
```

### 6.2 Passage SQLite → PostgreSQL

L'un des points forts de l'architecture est la **transparence du changement de base de données**. Le fichier `src/config/database.js` détecte automatiquement l'environnement :

```js
if (process.env.DATABASE_URL) {
  // Production Render → PostgreSQL avec SSL
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
    pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
  });
} else {
  // Développement local → SQLite fichier
  sequelize = new Sequelize({ dialect: 'sqlite', storage: 'neurovent.sqlite' });
}
```

Côté Django, le même pattern est utilisé via `dj-database-url` dans `settings.py` :

```python
DATABASE_URL = config('DATABASE_URL', default=None)
if DATABASE_URL:
    DATABASES = {'default': dj_database_url.parse(DATABASE_URL)}
else:
    DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': BASE_DIR / 'db.sqlite3'}}
```

### 6.3 Variables d'environnement de production

| Variable | Backend | Valeur production |
|---|---|---|
| `SECRET_KEY` | Django | Clé aléatoire sécurisée (50+ caractères) |
| `DEBUG` | Django | `False` obligatoirement |
| `ALLOWED_HOSTS` | Django | Domaine(s) de l'application |
| `CORS_ALLOWED_ORIGINS` | Django | URL du frontend React déployé |
| `DATABASE_URL` | Django + Node | Fourni automatiquement par Render |
| `JWT_SECRET` | Node.js | Généré par Render (`generateValue: true`) |
| `JWT_ACCESS_EXPIRES` | Node.js | `2h` |
| `JWT_REFRESH_EXPIRES` | Node.js | `7d` |
| `EMAIL_HOST_USER` | Django + Node | Adresse Gmail dédiée |
| `EMAIL_HOST_PASSWORD` | Django + Node | Mot de passe d'application Google (16 car.) |
| `FRONTEND_URL` | Django + Node | URL du frontend (pour les liens dans les emails) |

### 6.4 Configuration production Django

Django nécessite deux étapes supplémentaires pour la production :

**Fichiers statiques** — `WhiteNoise` est configuré comme middleware et sert les fichiers statiques directement depuis Gunicorn, sans serveur web séparé (Nginx) :

```python
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',  # Juste après SecurityMiddleware
    ...
]
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'
```

**Commandes de mise en production** :

```bash
# Backend Django
python manage.py collectstatic --noinput
python manage.py migrate
python scripts/reset_and_seed_demo.py   # Optionnel : données de démo

# Backend Node.js
npm install --production
node server.js                           # Sync DB + création admin auto au démarrage

# Frontend React
npm run build                            # → dossier build/ servi en statique
```

### 6.5 CORS et communication frontend/backend

Les deux backends autorisent explicitement les origines frontend en production. Côté Node.js, `app.js` accepte dynamiquement les déploiements Vercel :

```js
const allowedOrigins = ['http://localhost:3000', process.env.FRONTEND_URL].filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);               // Postman / curl
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (/^https:\/\/[^.]+\.vercel\.app$/.test(origin)) return callback(null, true);  // Vercel preview
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
```

### 6.6 Procédure de validation post-déploiement

Une fois le déploiement effectué, la validation s'appuie sur les endpoints de santé exposés par les deux backends :

```
GET /api/health/      → { "status": "ok", "message": "Neurovent Node.js API is running" }
GET /api/docs/        → Swagger UI (documentation interactive de l'API)
GET /api/redoc/       → ReDoc (documentation Django)
```

La suite de tests end-to-end Playwright disponible à la racine du projet (`playwright-tests/`, `playwright.config.cjs`) peut être exécutée avec :

```bash
npm run qa:test
```

Elle valide les flux critiques : inscription, login, création d'événement, inscription à un événement, et accès aux espaces admin — assurant une couverture fonctionnelle complète avant toute mise en production.

---
