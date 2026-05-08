# Backend NetKingdoms

Ce dossier contient le modèle de données et un exemple de fonction Supabase.

## Déploiement

1. Créer un projet Supabase.
2. Importer `schema.sql` dans SQL Editor ou via la CLI.
3. Déployer la fonction `visit.ts` comme Edge Function.
4. Configurer la variable d'environnement `SUPABASE_URL` dans la fonction.
5. Configurer la variable d'environnement `SUPABASE_SERVICE_ROLE_KEY` dans la fonction.
6. Configurer l'URL de la fonction dans l'extension via `VITE_VISIT_ENDPOINT`.

### Exemple avec la CLI Supabase

```bash
brew install supabase/tap/supabase
supabase login
cd /Volumes/ddexterne/jean-mi/extensions/NetKingdoms/backend
supabase init
supabase link --project-ref <PROJECT_REF>
# Exécute le schéma SQL dans la base liée
supabase db query --file schema.sql --linked
# Déploie la fonction Edge
supabase functions deploy visit --no-verify-jwt
```

Si ton projet n'est pas lié, tu peux exécuter le SQL directement avec une URL de base de données :

```bash
supabase db query --file schema.sql --db-url "postgres://user:password@host:port/dbname"
```

Puis, dans le dashboard Supabase, définis les variables d'environnement pour la fonction `visit`.

## Fonction

- `visit.ts` reçoit les visites signées de l'extension.
- Il doit vérifier l'authentification et la signature.
- Il enregistre les événements dans `browse_events`.

## Améliorations futures

- Signature HMAC / nonce
- Calcul de domination 12h
- Snapshots toutes les 6h
- Sélection de sites éphémères
- Analyse anti-triche
