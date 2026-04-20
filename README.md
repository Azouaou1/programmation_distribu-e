# Neurovent — Projet Programmation Distribuée 2025-2026

Plateforme web de gestion d'événements scientifiques et tech, déployée en microservices sur Kubernetes.

Projet réalisé en binôme dans le cadre du cours de Programmation Distribuée (Master Info / Master MLSD).

---

## Architecture

```
                        ┌─────────────────────────────────┐
                        │   NGINX Ingress (neurovent.local)│
                        └───────────┬─────────────────────┘
                                    │
                  ┌─────────────────┼──────────────────┐
                  │                                     │
         ┌────────▼────────┐               ┌───────────▼──────────┐
         │  Backend Node.js │               │   Frontend React      │
         │  (Express — REST)│               │   (Nginx — port 80)   │
         │  port 8001       │               └──────────────────────┘
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │   PostgreSQL     │
         │  (port 5432)     │
         │  PVC 1Gi         │
         └─────────────────┘
```

- **Gateway** : Ingress NGINX — route `/api` vers le backend, `/` vers le frontend
- **Backend** : Node.js / Express — API REST avec JWT, Swagger, Sequelize
- **Frontend** : React — build statique servi par Nginx
- **Base de données** : PostgreSQL 15 avec volume persistant (PVC)
- **Sécurité** : RBAC Kubernetes (ServiceAccounts dédiés, Roles, RoleBindings) + Secrets

---

## Technologies utilisées

| Couche | Technologie |
|---|---|
| Backend | Node.js 20, Express, Sequelize, JWT, Swagger |
| Frontend | React, React Router DOM |
| Base de données | PostgreSQL 15 |
| Conteneurisation | Docker (images publiées sur Docker Hub) |
| Orchestration | Kubernetes (Minikube en local) |
| Gateway | NGINX Ingress Controller |
| Sécurité | RBAC Kubernetes, Kubernetes Secrets |
| Tests | Jest + Supertest |
| Documentation API | Swagger UI (`/api/docs/`) |

---

## Structure du projet

```
Programmation_distribué/
├── backend-node/           # Microservice API REST (Node.js / Express)
│   ├── Dockerfile
│   ├── src/
│   │   ├── routes/         # auth, events, registrations, tags, companies
│   │   ├── models/         # Sequelize (PostgreSQL / SQLite)
│   │   ├── controllers/
│   │   └── config/         # swagger, database
│   └── tests/
├── frontend-react/         # Frontend React
│   └── src/
│       ├── pages/
│       ├── components/
│       ├── api/
│       └── context/
├── k8s/                    # Manifests Kubernetes
│   ├── backend-deployment.yaml
│   ├── frontend-deployment.yaml
│   ├── postgres-deployment.yaml
│   ├── ingress.yaml
│   ├── rbac.yaml
│   └── secrets.yaml
├── docs/                   # Rapport et livrables
└── playwright-tests/       # Tests E2E
```

---

## Prérequis

- Docker
- Minikube + kubectl
- Node.js 20+
- NGINX Ingress Controller activé sur Minikube

---

## Déploiement Kubernetes (local — Minikube)

### 1. Démarrer Minikube avec l'Ingress

```bash
minikube start
minikube addons enable ingress
```

### 2. Construire et publier les images Docker

```bash
# Backend
cd backend-node
docker build -t az1810/events-app-backend:latest .
docker push az1810/events-app-backend:latest

# Frontend
cd ../frontend-react
docker build -t az1810/events-app-frontend:latest .
docker push az1810/events-app-frontend:latest
```

### 3. Appliquer les manifests Kubernetes

```bash
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/rbac.yaml
kubectl apply -f k8s/postgres-deployment.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/ingress.yaml
```

### 4. Configurer le fichier hosts

```bash
echo "$(minikube ip) neurovent.local" | sudo tee -a /etc/hosts
```

### 5. Accéder à l'application

- Frontend : http://neurovent.local
- API : http://neurovent.local/api
- Swagger : http://neurovent.local/api/docs/
- Santé : http://neurovent.local/api/health/

---

## Lancement en local (développement)

### Backend Node.js

```bash
cd backend-node
cp .env.example .env   # configurer les variables
npm install
npm run dev
```

- API : http://localhost:8001
- Swagger : http://localhost:8001/api/docs/

### Frontend React

```bash
cd frontend-react
npm install
npm start
```

- Frontend : http://localhost:3000

---

## Sécurité Kubernetes (RBAC)

Le fichier `k8s/rbac.yaml` met en place :

- **ServiceAccount** dédié pour le backend (`neurovent-backend-sa`) et le frontend (`neurovent-frontend-sa`) — le compte `default` n'est pas utilisé
- `automountServiceAccountToken: false` sur chaque Pod pour éviter le montage automatique du token
- **Role backend** : accès en lecture seule aux Secrets et ConfigMaps nécessaires
- **Role frontend** : accès en lecture seule aux ConfigMaps uniquement
- **RoleBindings** : lient chaque ServiceAccount à son Role respectif

Les identifiants sensibles (mot de passe PostgreSQL, clé JWT) sont stockés dans un Kubernetes Secret (`k8s/secrets.yaml`).

---

## API — Endpoints principaux

### Auth
- `POST /api/auth/register/participant/`
- `POST /api/auth/register/company/`
- `POST /api/auth/login/participant/`
- `POST /api/auth/login/company/`
- `GET  /api/auth/me/`

### Events
- `GET    /api/events/`
- `GET    /api/events/:id/`
- `POST   /api/events/create/`
- `PATCH  /api/events/:id/update/`
- `DELETE /api/events/:id/delete/`
- `GET    /api/events/my-events/`
- `GET    /api/events/dashboard-stats/`

### Registrations
- `POST /api/registrations/`
- `GET  /api/registrations/my-registrations/`

### Admin
- `GET    /api/auth/admin/users/`
- `PATCH  /api/auth/admin/users/:id/suspend/`
- `PATCH  /api/auth/admin/companies/:id/verify/`
- `DELETE /api/events/admin/:id/delete/`
- `GET    /api/auth/admin/stats/`

---

## Comptes de démonstration

| Rôle | Email / Username | Mot de passe |
|---|---|---|
| Participant | amelie.rousseau@participants.neurovent.demo | `Participant2026!` |
| Organisation | atlas-neuro-labs | `Company2026!` |
| Admin | admin@neurovent.demo | `Admin2026!` |

Pour initialiser la base de données de démo (mode dev) :

```bash
cd backend-node
npm run seed
```

---

## Tests

```bash
# Tests backend (Jest + Supertest)
cd backend-node
npm test

# Tests avec couverture
npm run test:coverage
```

---

## Critères du projet couverts

| Niveau | Critère | Statut |
|---|---|---|
| 10/20 | Service unique + Docker + Kubernetes | ✓ |
| 12/20 | Gateway via Ingress NGINX | ✓ |
| 14/20 | Deuxième service (frontend) relié au backend | ✓ |
| 16/20 | Base de données PostgreSQL avec PVC | ✓ |
| 18/20 | Sécurité RBAC Kubernetes + Secrets | ✓ |

---

## Images Docker Hub

- Backend : `az1810/events-app-backend:latest`
- Frontend : `az1810/events-app-frontend:latest`
