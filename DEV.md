# NetKingdoms — Guide développeur

## Structure du projet

```
NetKingdoms/
├── src/                        ← Extension Chrome (MV3)
├── web/                        ← Site web companion (React SPA)
├── backend/supabase/
│   ├── functions/              ← Edge Functions Deno
│   └── migrations/             ← Migrations SQL
├── .github/workflows/cron.yml  ← CRON GitHub Actions
├── .env                        ← Variables extension (copier depuis .env.example)
└── web/.env                    ← Variables site web (copier depuis web/.env.example)
```

---

## 1. Extension Chrome

### Prérequis
```bash
cd /Volumes/ddexterne/jean-mi/extensions/NetKingdoms
cp .env.example .env        # puis remplir les valeurs
npm install
```

### Développement (hot-reload)
```bash
npm run dev
```
→ Génère `dist/` en mode watch. Charger `dist/` dans Chrome (`chrome://extensions` → mode développeur → "Charger l'extension non empaquetée").

**Recharger après chaque build :** sur `chrome://extensions`, cliquer le bouton ↺ de l'extension.

### Build production
```bash
npm run build
```
→ Produit `dist/`. À soumettre sur le Chrome Web Store.

### Lint / Format
```bash
npm run lint
npm run format
```

### Fichiers clés
| Fichier | Rôle |
|---|---|
| `src/service-worker.ts` | Background : dwell timer, batch visits, badge, notifications |
| `src/App.tsx` | Popup (faction, scores, territoires) |
| `src/Onboarding.tsx` | Page onboarding (welcome → faction → pseudo → done) |
| `src/lib/classify.ts` | Classement domaine → tier/zone |
| `src/lib/domain.ts` | Normalisation d'URL |
| `src/manifest.json` | Manifest MV3 |

### Variables d'environnement (`.env`)
```env
VITE_SUPABASE_URL=https://hfqzsduezngpmxfplnfg.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_VISIT_ENDPOINT=https://hfqzsduezngpmxfplnfg.supabase.co/functions/v1/visit
SUPABASE_URL=https://hfqzsduezngpmxfplnfg.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

---

## 2. Site web

### Prérequis
```bash
cd /Volumes/ddexterne/jean-mi/extensions/NetKingdoms/web
cp .env.example .env        # puis remplir les valeurs
npm install
```

### Développement (hot-reload)
```bash
npm run dev
```
→ Accessible sur **http://localhost:5174**

### Build production
```bash
npm run build
```
→ Produit `web/dist/`. Déployer sur Vercel, Netlify, etc.

### Aperçu du build
```bash
npm run preview
```

### Pages disponibles
| Route | Page |
|---|---|
| `/` | Home — présentation + stats saison |
| `/map` | Carte 3D des territoires (ForceGraph3D) |
| `/clan` | Gestion de clan (créer, rejoindre, gérer) |
| `/ladder` | Classement factions + clans |
| `/challenge` | Kingdom Challenge hebdomadaire |
| `/profile` | Profil, badges, historique saisons |
| `/auth` | Connexion magic link |
| `/privacy` | Politique de confidentialité |

### Variables d'environnement (`web/.env`)
```env
VITE_SUPABASE_URL=https://hfqzsduezngpmxfplnfg.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

---

## 3. Backend — Edge Functions

### Prérequis
```bash
# Installer Supabase CLI
brew install supabase/tap/supabase

# Se lier au projet distant (depuis backend/)
cd /Volumes/ddexterne/jean-mi/extensions/NetKingdoms/backend
supabase link --project-ref hfqzsduezngpmxfplnfg
```

### Déployer une fonction
```bash
cd backend
supabase functions deploy <nom-fonction> --no-verify-jwt
```

### Déployer toutes les fonctions
```bash
cd backend
for fn in visit update-dominance take-snapshot cleanup-territories manage-ephemeral clan-ops season-reset detect-anomalies create-challenge validate-challenge; do
  supabase functions deploy $fn --no-verify-jwt
done
```

### Lister les fonctions déployées
```bash
supabase functions list --project-ref hfqzsduezngpmxfplnfg
```

### Fonctions et leur déclencheur
| Fonction | Déclencheur | Rôle |
|---|---|---|
| `visit` | Extension (batch POST) | Enregistre visites, territoires, scores |
| `update-dominance` | CRON 15min | Calcule faction dominante par territoire |
| `take-snapshot` | CRON 4×/jour | Distribue points saison aux factions |
| `cleanup-territories` | CRON quotidien 3h | Purge inactifs 72h, succession clans |
| `manage-ephemeral` | CRON lundi 6h | Active sites éphémères ×5 |
| `season-reset` | CRON lundi (semaines paires) | Archive saison, récompenses, nouvelle saison |
| `detect-anomalies` | CRON 30min | Détecte fraudes, shadow throttle |
| `create-challenge` | CRON lundi 0h | Crée le Kingdom Challenge de la semaine |
| `validate-challenge` | Site web (GET/POST) | Récupère/valide le challenge |
| `clan-ops` | Site web (POST) | CRUD clans (créer, rejoindre, quitter, kick…) |

### Tester une fonction manuellement
```bash
ANON="<anon key>"
SERVICE="<service role key>"
BASE="https://hfqzsduezngpmxfplnfg.supabase.co/functions/v1"

# Créer le challenge de la semaine
curl -s -X POST "$BASE/create-challenge" -H "Content-Type: application/json" -d '{}'

# Voir le challenge courant
curl -s "$BASE/validate-challenge" -H "Authorization: Bearer $ANON"

# Forcer un snapshot
curl -s -X POST "$BASE/take-snapshot" -H "Content-Type: application/json" -d '{}'

# Forcer cleanup
curl -s -X POST "$BASE/cleanup-territories" -H "Content-Type: application/json" -d '{}'

# Forcer la mise à jour de dominance
curl -s -X POST "$BASE/update-dominance" -H "Content-Type: application/json" -d '{}'
```

---

## 4. Base de données

### Appliquer les migrations
```bash
cd backend
supabase db push --project-ref hfqzsduezngpmxfplnfg
```

### Migrations existantes (dans l'ordre)
| Fichier | Contenu |
|---|---|
| `20260503000001_phase2_schema.sql` | Tables clans, rewards, ephemeral_sites, saisons |
| `20260503000002_cron_jobs.sql` | Extensions pg_cron |
| `20260503000003_clan_rpcs.sql` | RPC increment_clan_score |
| `20260503000004_phase3_schema.sql` | Colonnes Phase 3 (shadow_throttle, etc.) |
| `20260503000005_challenges.sql` | Tables challenges + challenge_completions |

### Accès direct (REST)
```bash
ANON="<anon key>"
BASE="https://hfqzsduezngpmxfplnfg.supabase.co/rest/v1"

curl -s "$BASE/territories?limit=10" -H "apikey: $ANON"
curl -s "$BASE/seasons?is_active=eq.true" -H "apikey: $ANON"
curl -s "$BASE/challenges?limit=5" -H "apikey: $ANON"
curl -s "$BASE/clans?order=season_score.desc&limit=10" -H "apikey: $ANON"
```

### Dashboard Supabase
→ https://supabase.com/dashboard/project/hfqzsduezngpmxfplnfg

---

## 5. CRON — GitHub Actions

Fichier : `.github/workflows/cron.yml`

Les jobs tournent automatiquement selon le schedule. Pour déclencher manuellement :

```
GitHub → repo → Actions → NetKingdoms CRON → Run workflow
```

| Schedule | Fonctions déclenchées |
|---|---|
| `*/15 * * * *` | update-dominance |
| `0 0,6,12,18 * * *` | take-snapshot |
| `0 3 * * *` | cleanup-territories |
| `0 0 * * 1` (lundi 0h) | create-challenge |
| `0 6 * * 1` (lundi 6h) | manage-ephemeral |
| `0 0 * * 1` (lundi paires) | season-reset |
| `*/30 * * * *` | detect-anomalies |

---

## 6. Workflow dev typique

### Modifier l'extension
```bash
cd /Volumes/ddexterne/jean-mi/extensions/NetKingdoms
npm run dev          # lance le watcher
# → modifier src/, l'extension se rebuild auto
# → aller sur chrome://extensions et cliquer ↺
```

### Modifier le site web
```bash
cd web
npm run dev          # http://localhost:5174, hot-reload auto
```

### Modifier une Edge Function
```bash
# Éditer backend/supabase/functions/<nom>/index.ts
cd backend
supabase functions deploy <nom> --no-verify-jwt
# Tester avec curl (voir section 3)
```

### Ajouter une migration SQL
```bash
# Créer le fichier
touch backend/supabase/migrations/2026MMDD000006_ma_migration.sql
# Écrire le SQL, puis pousser
cd backend && supabase db push --project-ref hfqzsduezngpmxfplnfg
```

---

## 7. Récupérer les clés API

```bash
# Anon key + service role key
cd backend && supabase projects api-keys --project-ref hfqzsduezngpmxfplnfg
```

Ou depuis le Dashboard → Project Settings → API.

---

## 8. Constantes importantes

| Constante | Valeur | Lieu |
|---|---|---|
| Dwell minimum | 12 secondes | `service-worker.ts` |
| Cooldown par domaine | 45 minutes | `service-worker.ts` |
| Max domaines/heure | 25 | `service-worker.ts` |
| Inactivité badge gris | 24h sans visite | `service-worker.ts` |
| Territoire inactif | 48h → faction perdue | `cleanup-territories` |
| Territoire purgé | 72h → supprimé | `cleanup-territories` |
| Challenge valide | 72h après création | `create-challenge` |
| Snapshot bonus zone | ×1.5 | `take-snapshot` |
| Snapshot éphémère | ×5 | `take-snapshot` |
| Snapshot contesté | ×0.5 | `take-snapshot` |
| Succession chef clan | 14j inactif | `cleanup-territories` |
| Dissolution clan | 30j tous inactifs | `cleanup-territories` |
| Nouveau compte trust | 50% score clan (<7j) | `visit` |
