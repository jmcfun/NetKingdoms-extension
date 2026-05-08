# NetKingdoms

Prototype d'extension Chrome qui transforme la navigation en jeu de domination territoriale.

## Structure

- `src/manifest.json` : manifeste Chrome Manifest V3
- `src/service-worker.ts` : logique de suivi des visites et batch d'envoi
- `src/App.tsx` : popup React de statut et faction
- `src/lib` : utilitaires de normalisation et classification de domaines
- `backend/` : modèle de base de données et fonction Supabase

## Installation

```bash
npm install
```

## Variables d'environnement

Copiez `.env.example` en `.env` et configurez :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_VISIT_ENDPOINT` (par exemple `https://<project>.functions.supabase.co/visit`)

Pour la fonction Supabase, configurez également :

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Développement

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Backend Supabase

Le backend doit recevoir des événements signés et enregistrer les visites :

- `backend/schema.sql` : tables initiales
- `backend/functions/visit.ts` : fonction edge stub

## Déploiement Supabase

### 1. Installer la CLI Supabase

Si tu n'as pas encore la CLI :

```bash
npm install -g supabase
```

### 2. Se connecter à Supabase

```bash
supabase login
```

### 3. Lier le projet à ton espace Supabase

```bash
cd /Volumes/ddexterne/jean-mi/extensions/NetKingdoms/backend
supabase init
```

Si ton projet existe déjà :

```bash
supabase link --project-ref <PROJECT_REF>
```

### 4. Importer le schéma SQL

Avec la CLI Supabase v2, utilise `db query` pour exécuter le fichier SQL :

```bash
supabase db query --file schema.sql --linked
```

Si ton projet n'est pas encore lié ou si tu veux pousser vers une base distante directement :

```bash
supabase db query --file schema.sql --db-url "postgres://user:password@host:port/dbname"
```

### 5. Déployer la fonction Edge

```bash
supabase functions deploy visit --no-verify-jwt
```

### 6. Configurer les variables d'environnement de la fonction

Dans le tableau de bord Supabase > Settings > API, récupère :

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Puis configure-les dans les paramètres de la fonction Edge :

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 7. Configurer l'extension

Copie `.env.example` en `.env` et complète :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_VISIT_ENDPOINT`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

> `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont uniquement nécessaires pour la fonction backend. Ne les publie pas dans ton dépôt.

### 8. Construire et charger l'extension

```bash
npm run build
```

Ensuite, ouvre Chrome :

1. `chrome://extensions`
2. Activer `Mode développeur`
3. Cliquer sur `Charger l'extension non empaquetée`
4. Sélectionner le dossier `dist`

### 9. Tester l'envoi des visites

1. Ouvre le popup NetKingdoms.
2. Connecte-toi avec un compte Supabase si tu veux tester l'auth.
3. Navigue sur des sites différents.
4. Sur `chrome://extensions`, active `Inspect views` pour la page d'arrière-plan ou utilise le DevTools du service worker.
5. Vérifie dans la console que les requêtes POST partent vers `VITE_VISIT_ENDPOINT`.

## Remarques

- L'extension applique une vérification locale : cooldown 45 min, 12s de dwell time, cap 25 domaines uniques par heure.
- Les visites sont envoyées en batch toutes les 30s avec une signature HMAC si l'utilisateur est connecté.
- Le workflow d'authentification peut utiliser Supabase pour lier le joueur à un compte.
