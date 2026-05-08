# NetKingdoms — Guide de migration Laravel

Guide complet pour recréer le backend + site web NetKingdoms en Laravel 11.
L'extension Chrome **ne change pas** (seulement les URLs dans son `.env`).

---

## Stack cible

| Composant | Technologie |
|---|---|
| Backend / API | Laravel 11 (PHP 8.3+) |
| Base de données | PostgreSQL 16 |
| Auth | Laravel Socialite (Google, Facebook, GitHub, Apple) |
| Tokens extension | Laravel Sanctum |
| Jobs planifiés | Laravel Scheduler + Queue |
| Frontend | React SPA existant (inchangé) ou Inertia.js + Vue |
| Temps réel (optionnel) | Laravel Echo + Pusher / Soketi |

---

## 1. Prérequis serveur

```bash
# PHP 8.3+ avec extensions
php -m | grep -E "pdo_pgsql|redis|gd|bcmath|json|mbstring|openssl|tokenizer"

# Composer
composer --version  # >= 2.x

# Node (pour le frontend React)
node --version  # >= 20

# PostgreSQL
psql --version  # >= 15
```

---

## 2. Création du projet Laravel

```bash
composer create-project laravel/laravel netkingdoms-api
cd netkingdoms-api

# Packages
composer require laravel/sanctum
composer require laravel/socialite
composer require socialiteproviders/apple      # Apple Sign In
composer require socialiteproviders/facebook   # Facebook/Meta
# Google et GitHub sont inclus dans laravel/socialite nativement
```

---

## 3. Configuration `.env`

```env
APP_NAME=NetKingdoms
APP_ENV=production
APP_URL=https://votre-domaine.com

DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=netkingdoms
DB_USERNAME=netkingdoms_user
DB_PASSWORD=motdepasse_fort

QUEUE_CONNECTION=database   # ou redis si disponible
CACHE_STORE=database

# Auth sociale
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI="${APP_URL}/auth/callback/google"

FACEBOOK_CLIENT_ID=xxx
FACEBOOK_CLIENT_SECRET=xxx
FACEBOOK_REDIRECT_URI="${APP_URL}/auth/callback/facebook"

GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GITHUB_REDIRECT_URI="${APP_URL}/auth/callback/github"

APPLE_CLIENT_ID=xxx        # bundle ID de l'app Apple
APPLE_CLIENT_SECRET=xxx    # JWT signé (voir doc socialiteproviders/apple)
APPLE_REDIRECT_URI="${APP_URL}/auth/callback/apple"

# Constantes gameplay (doivent correspondre à l'extension)
VISIT_DWELL_MS=12000
VISIT_COOLDOWN_MS=2700000    # 45 minutes
VELOCITY_WINDOW_MS=3600000
MAX_UNIQUE_DOMAINS=25

# CORS : autoriser le frontend React et l'extension
FRONTEND_URL=https://votre-domaine.com
```

---

## 4. Base de données — Migrations

Créer chaque migration dans l'ordre avec `php artisan make:migration`.

### 4.1 — users

```php
// database/migrations/xxxx_create_users_table.php
Schema::create('users', function (Blueprint $table) {
    $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
    $table->string('email')->nullable()->unique();
    $table->string('username', 20)->nullable();
    $table->string('faction', 30)->default('Fondeurs');
    $table->foreignUuid('clan_id')->nullable()->constrained('clans')->nullOnDelete();
    $table->integer('season_score')->default(0);
    $table->integer('faction_locked_season')->nullable();
    $table->boolean('shadow_throttle')->default(false);
    $table->smallInteger('trust_level')->default(0); // 0=new, 1=trusted, 2=established
    $table->timestamp('last_active_at')->nullable();
    $table->timestamps();
});
```

> **Note :** `clan_id` référence `clans` — créer `clans` en premier ou utiliser
> une migration séparée pour la contrainte FK.

### 4.2 — social_accounts (OAuth providers)

```php
Schema::create('social_accounts', function (Blueprint $table) {
    $table->id();
    $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
    $table->string('provider', 30);          // google, facebook, github, apple
    $table->string('provider_id');
    $table->string('token')->nullable();
    $table->string('refresh_token')->nullable();
    $table->timestamp('token_expires_at')->nullable();
    $table->timestamps();
    $table->unique(['provider', 'provider_id']);
});
```

### 4.3 — clans

```php
Schema::create('clans', function (Blueprint $table) {
    $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
    $table->string('name', 50)->unique();
    $table->string('faction', 30);
    $table->foreignUuid('leader_id')->constrained('users');
    $table->smallInteger('max_members')->default(5);
    $table->integer('season_score')->default(0);
    $table->timestamps();
});
```

### 4.4 — seasons

```php
Schema::create('seasons', function (Blueprint $table) {
    $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
    $table->integer('number');
    $table->boolean('is_active')->default(true);
    $table->timestamp('started_at');
    $table->timestamp('ended_at')->nullable();
    $table->integer('fondeurs_score')->default(0);
    $table->integer('spectres_score')->default(0);
    $table->integer('nomades_score')->default(0);
    $table->string('winner_faction', 30)->nullable();
    $table->integer('total_territories')->default(0);
    $table->integer('total_snapshots')->default(0);
    $table->timestamps();
});
```

### 4.5 — territories

```php
Schema::create('territories', function (Blueprint $table) {
    $table->string('domain')->primary();      // PK textuelle
    $table->string('tier', 2)->default('D');  // S, A, B, C, D
    $table->string('zone', 30)->default('Neutre');
    $table->string('dominant_faction', 30)->nullable();
    $table->boolean('is_contested')->default(false);
    $table->boolean('is_ephemeral')->default(false);
    $table->foreignUuid('first_seen_by')->nullable()->constrained('users')->nullOnDelete();
    $table->string('first_seen_faction', 30)->nullable();
    $table->smallInteger('value_snapshot')->default(1);
    $table->timestamp('last_visit_at')->nullable();
    $table->timestamp('last_dominant_update')->nullable();
    $table->timestamps();
});
```

### 4.6 — browse_events

```php
Schema::create('browse_events', function (Blueprint $table) {
    $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
    $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
    $table->string('domain');
    $table->text('url')->default('');
    $table->string('tier', 2)->default('D');
    $table->string('zone', 30)->default('Neutre');
    $table->string('faction', 30)->default('Fondeurs');
    $table->boolean('flagged')->default(false);
    $table->timestamp('created_at');

    $table->index(['domain', 'faction', 'created_at']);
    $table->index(['user_id', 'domain', 'created_at']);
});
```

### 4.7 — ephemeral_sites

```php
Schema::create('ephemeral_sites', function (Blueprint $table) {
    $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
    $table->string('domain')->unique();
    $table->string('tier', 2)->default('A');
    $table->timestamp('end_at');
    $table->timestamps();
});
```

### 4.8 — season_snapshots

```php
Schema::create('season_snapshots', function (Blueprint $table) {
    $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
    $table->foreignUuid('season_id')->constrained('seasons')->cascadeOnDelete();
    $table->string('domain');
    $table->foreign('domain')->references('domain')->on('territories')->cascadeOnDelete();
    $table->string('dominant_faction', 30);
    $table->integer('points_awarded');
    $table->boolean('is_contested')->default(false);
    $table->boolean('is_ephemeral')->default(false);
    $table->timestamp('snapshotted_at')->useCurrent();
});
```

### 4.9 — rewards

```php
Schema::create('rewards', function (Blueprint $table) {
    $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
    $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
    $table->foreignUuid('season_id')->nullable()->constrained('seasons')->nullOnDelete();
    $table->string('type', 30);   // top_faction, top_clan, top_pct, participation
    $table->string('label');
    $table->string('icon', 10)->default('🏅');
    $table->timestamp('earned_at')->useCurrent();
    $table->index('user_id');
});
```

### 4.10 — challenges

```php
Schema::create('challenges', function (Blueprint $table) {
    $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
    $table->integer('week_number');
    $table->integer('year');
    $table->text('question');
    $table->jsonb('choices');   // [{text, is_correct}]
    $table->timestamp('expires_at');
    $table->timestamps();
    $table->unique(['week_number', 'year']);
});
```

### 4.11 — challenge_completions

```php
Schema::create('challenge_completions', function (Blueprint $table) {
    $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
    $table->foreignUuid('challenge_id')->constrained('challenges')->cascadeOnDelete();
    $table->timestamp('completed_at')->useCurrent();
    $table->primary(['user_id', 'challenge_id']);
    $table->index('user_id');
});
```

### 4.12 — audit_flags

```php
Schema::create('audit_flags', function (Blueprint $table) {
    $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
    $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
    $table->string('type', 50);       // velocity, diversity, clan_spike
    $table->jsonb('detail')->nullable();
    $table->boolean('auto_detected')->default(true);
    $table->timestamp('resolved_at')->nullable();
    $table->text('notes')->nullable();
    $table->timestamps();
});
```

### Lancer les migrations

```bash
php artisan migrate
```

### Seeder — Saison 1

```bash
php artisan make:seeder SeasonSeeder
```

```php
// database/seeders/SeasonSeeder.php
Season::create([
    'number'     => 1,
    'started_at' => now(),
    'is_active'  => true,
]);
```

```bash
php artisan db:seed --class=SeasonSeeder
```

---

## 5. Modèles Eloquent

```bash
php artisan make:model User -m
php artisan make:model SocialAccount
php artisan make:model Clan
php artisan make:model Season
php artisan make:model Territory
php artisan make:model BrowseEvent
php artisan make:model EphemeralSite
php artisan make:model SeasonSnapshot
php artisan make:model Reward
php artisan make:model Challenge
php artisan make:model ChallengeCompletion
php artisan make:model AuditFlag
```

### User.php

```php
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens;

    public $incrementing = false;
    protected $keyType   = 'string';

    protected $fillable = [
        'id', 'email', 'username', 'faction', 'clan_id',
        'season_score', 'faction_locked_season',
        'shadow_throttle', 'trust_level', 'last_active_at',
    ];

    protected $casts = [
        'shadow_throttle' => 'boolean',
        'last_active_at'  => 'datetime',
    ];

    public function clan()       { return $this->belongsTo(Clan::class); }
    public function socialAccounts() { return $this->hasMany(SocialAccount::class); }
    public function rewards()    { return $this->hasMany(Reward::class); }
    public function browseEvents() { return $this->hasMany(BrowseEvent::class); }
}
```

### Clan.php

```php
class Clan extends Model
{
    public $incrementing = false;
    protected $keyType   = 'string';

    protected $fillable = [
        'name', 'faction', 'leader_id', 'max_members', 'season_score',
    ];

    public function leader()  { return $this->belongsTo(User::class, 'leader_id'); }
    public function members() { return $this->hasMany(User::class); }
}
```

### Territory.php

```php
class Territory extends Model
{
    protected $primaryKey = 'domain';
    public $incrementing  = false;
    protected $keyType    = 'string';

    protected $fillable = [
        'domain', 'tier', 'zone', 'dominant_faction', 'is_contested',
        'is_ephemeral', 'first_seen_by', 'first_seen_faction',
        'value_snapshot', 'last_visit_at', 'last_dominant_update',
    ];

    protected $casts = [
        'is_contested' => 'boolean',
        'is_ephemeral' => 'boolean',
        'last_visit_at' => 'datetime',
    ];
}
```

### Challenge.php

```php
class Challenge extends Model
{
    protected $fillable = ['week_number', 'year', 'question', 'choices', 'expires_at'];
    protected $casts    = ['choices' => 'array', 'expires_at' => 'datetime'];

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }

    public function completedBy(string $userId): bool
    {
        return ChallengeCompletion::where('user_id', $userId)
            ->where('challenge_id', $this->id)
            ->exists();
    }
}
```

---

## 6. Authentification — Laravel Socialite

### config/services.php

```php
'google' => [
    'client_id'     => env('GOOGLE_CLIENT_ID'),
    'client_secret' => env('GOOGLE_CLIENT_SECRET'),
    'redirect'      => env('GOOGLE_REDIRECT_URI'),
],
'facebook' => [
    'client_id'     => env('FACEBOOK_CLIENT_ID'),
    'client_secret' => env('FACEBOOK_CLIENT_SECRET'),
    'redirect'      => env('FACEBOOK_REDIRECT_URI'),
],
'github' => [
    'client_id'     => env('GITHUB_CLIENT_ID'),
    'client_secret' => env('GITHUB_CLIENT_SECRET'),
    'redirect'      => env('GITHUB_REDIRECT_URI'),
],
'apple' => [
    'client_id'     => env('APPLE_CLIENT_ID'),
    'client_secret' => env('APPLE_CLIENT_SECRET'),
    'redirect'      => env('APPLE_REDIRECT_URI'),
],
```

### app/Http/Controllers/AuthController.php

```php
<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\SocialAccount;
use Laravel\Socialite\Facades\Socialite;
use Illuminate\Support\Str;
use Illuminate\Http\Request;

class AuthController extends Controller
{
    private const PROVIDERS = ['google', 'facebook', 'github', 'apple'];

    // Redirect vers le provider OAuth
    public function redirect(string $provider)
    {
        abort_unless(in_array($provider, self::PROVIDERS), 404);
        return Socialite::driver($provider)->stateless()->redirect();
    }

    // Callback OAuth → crée ou retrouve l'utilisateur → token Sanctum
    public function callback(string $provider)
    {
        abort_unless(in_array($provider, self::PROVIDERS), 404);

        try {
            $socialUser = Socialite::driver($provider)->stateless()->user();
        } catch (\Exception $e) {
            return redirect(env('FRONTEND_URL') . '/auth?error=oauth_failed');
        }

        // Retrouve ou crée le compte social
        $account = SocialAccount::firstOrNew([
            'provider'    => $provider,
            'provider_id' => $socialUser->getId(),
        ]);

        if (!$account->exists) {
            // Vérifie si un user existe déjà avec cet email
            $user = $socialUser->getEmail()
                ? User::firstOrCreate(
                    ['email' => $socialUser->getEmail()],
                    [
                        'id'       => (string) Str::uuid(),
                        'username' => $this->uniqueUsername($socialUser->getName()),
                        'faction'  => 'Fondeurs',
                    ]
                )
                : User::create([
                    'id'      => (string) Str::uuid(),
                    'faction' => 'Fondeurs',
                ]);

            $account->fill([
                'user_id'          => $user->id,
                'token'            => $socialUser->token,
                'refresh_token'    => $socialUser->refreshToken,
                'token_expires_at' => $socialUser->expiresIn
                    ? now()->addSeconds($socialUser->expiresIn) : null,
            ])->save();
        } else {
            $user = $account->user;
        }

        $user->update(['last_active_at' => now()]);

        // Génère un token Sanctum (utilisé par l'extension et le SPA)
        $token = $user->createToken('netkingdoms')->plainTextToken;

        // Redirige vers le frontend avec le token dans le hash
        // Le SPA React le lit et le stocke (LocalStorage + extension via content script)
        return redirect(env('FRONTEND_URL') . '/auth/callback#token=' . $token . '&user_id=' . $user->id);
    }

    public function me(Request $request)
    {
        return response()->json($request->user()->load('clan'));
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['ok' => true]);
    }

    private function uniqueUsername(?string $name): string
    {
        $base = preg_replace('/[^a-zA-Z0-9]/', '', $name ?? 'Joueur');
        $base = substr($base ?: 'Joueur', 0, 16);
        $candidate = $base;
        $i = 1;
        while (User::where('username', $candidate)->exists()) {
            $candidate = $base . $i++;
        }
        return $candidate;
    }
}
```

### Routes auth

```php
// routes/web.php
Route::get('/auth/redirect/{provider}', [AuthController::class, 'redirect']);
Route::get('/auth/callback/{provider}',  [AuthController::class, 'callback']);
```

```php
// routes/api.php
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me',     [AuthController::class, 'me']);
    Route::post('/logout',[AuthController::class, 'logout']);
});
```

### Frontend — lire le token après OAuth

Dans `web/src/pages/AuthPage.tsx` (ou un composant `/auth/callback`), lire le `#token=` après le redirect OAuth :

```typescript
// web/src/pages/AuthCallback.tsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const token = hash.get('token')
    const userId = hash.get('user_id')
    if (token) {
      localStorage.setItem('nk_token', token)
      localStorage.setItem('nk_user_id', userId ?? '')
      // Le content script de l'extension détectera ce changement
      navigate('/') 
    }
  }, [])

  return <p>Connexion en cours…</p>
}
```

### Content script extension — adapter pour Laravel

Le bridge `content-auth-bridge.ts` doit lire `nk_token` au lieu de la clé Supabase :

```typescript
// src/content-auth-bridge.ts — version Laravel
function syncSession() {
  const token  = localStorage.getItem('nk_token')
  const userId = localStorage.getItem('nk_user_id')
  if (token) {
    chrome.runtime.sendMessage({ type: 'sync_auth', session: { access_token: token, user: { id: userId } } })
  }
}

syncSession()

window.addEventListener('storage', (e) => {
  if (e.key === 'nk_token') syncSession()
})
```

---

## 7. API Routes complètes

```php
// routes/api.php

// ── Public ────────────────────────────────────────────────────────────────
Route::get('/season',          [SeasonController::class, 'current']);
Route::get('/territories',     [TerritoryController::class, 'index']);
Route::get('/ladder',          [LadderController::class, 'index']);
Route::get('/challenge',       [ChallengeController::class, 'current']);

// ── Authentifié (Sanctum) ─────────────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me',           [AuthController::class, 'me']);
    Route::post('/logout',      [AuthController::class, 'logout']);
    Route::patch('/me/faction', [UserController::class, 'updateFaction']);

    // Visites (venant de l'extension)
    Route::post('/visits',      [VisitController::class, 'store']);

    // Challenge
    Route::post('/challenge/validate', [ChallengeController::class, 'validate']);

    // Clans
    Route::get('/clan',              [ClanController::class, 'myInfo']);
    Route::post('/clan',             [ClanController::class, 'create']);
    Route::post('/clan/join',        [ClanController::class, 'join']);
    Route::post('/clan/leave',       [ClanController::class, 'leave']);
    Route::delete('/clan/members/{userId}', [ClanController::class, 'kick']);
    Route::patch('/clan/leader',     [ClanController::class, 'transfer']);

    // Profil
    Route::get('/profile',           [ProfileController::class, 'show']);
});
```

---

## 8. Controllers principaux

### VisitController.php

```php
<?php

namespace App\Http\Controllers;

use App\Models\BrowseEvent;
use App\Models\Territory;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class VisitController extends Controller
{
    // Constantes anti-cheat (correspondre à l'extension)
    private const COOLDOWN_MS    = 2_700_000; // 45 min
    private const VELOCITY_WINDOW_MS = 3_600_000;
    private const MAX_UNIQUE_DOMAINS  = 25;
    private const TIER_VALUES = ['S' => 10, 'A' => 5, 'B' => 2, 'C' => 1, 'D' => 0];

    public function store(Request $request)
    {
        $request->validate([
            'visits'   => 'required|array|min:1|max:20',
            'visits.*.domain' => 'required|string|max:253',
            'visits.*.url'    => 'required|string',
            'visits.*.tier'   => 'required|in:S,A,B,C,D',
            'visits.*.zone'   => 'required|string',
            'visits.*.faction'=> 'required|in:Fondeurs,Spectres,Nomades',
            'visits.*.createdAt' => 'required|date',
        ]);

        $user = $request->user();

        // Shadow throttle — retourne 200 silencieusement
        if ($user->shadow_throttle) {
            return response()->json(['ok' => true, 'received' => count($request->visits)]);
        }

        // Kingdom Challenge gate
        if (!$this->isChallengeValid($user->id)) {
            return response()->json([
                'ok'                 => false,
                'challenge_required' => true,
                'message'            => 'Complète le Kingdom Challenge pour valider tes visites.',
            ], 403);
        }

        // Mise à jour activité
        $user->update(['last_active_at' => now()]);

        $newDiscoveries = 0;

        DB::transaction(function () use ($request, $user, &$newDiscoveries) {
            $visits = $request->visits;

            // Insérer browse_events
            $events = array_map(fn($v) => [
                'id'         => (string) \Illuminate\Support\Str::uuid(),
                'user_id'    => $user->id,
                'domain'     => $v['domain'],
                'url'        => $v['url'] ?? '',
                'tier'       => $v['tier'] ?? 'D',
                'zone'       => $v['zone'] ?? 'Neutre',
                'faction'    => $v['faction'] ?? 'Fondeurs',
                'created_at' => $v['createdAt'],
            ], $visits);

            BrowseEvent::insert($events);

            // Upsert territoires
            foreach ($visits as $v) {
                $tier  = $v['tier'] ?? 'D';
                $value = $tier === 'D'
                    ? rand(1, 8)
                    : (self::TIER_VALUES[$tier] ?? 1);

                $existing = Territory::where('domain', $v['domain'])->exists();

                Territory::upsert([
                    'domain'             => $v['domain'],
                    'tier'               => $tier,
                    'zone'               => $v['zone'] ?? 'Neutre',
                    'first_seen_by'      => $existing ? null : $user->id,
                    'first_seen_faction' => $existing ? null : $v['faction'],
                    'value_snapshot'     => $value,
                    'last_visit_at'      => now(),
                ], ['domain'], ['last_visit_at']);

                if (!$existing) $newDiscoveries++;
            }

            // Score clan
            if ($user->clan_id) {
                $total = count($visits) + $newDiscoveries;
                $effective = $user->trust_level === 0
                    ? (int) floor($total * 0.5)
                    : $total;
                if ($effective > 0) {
                    DB::statement(
                        'UPDATE clans SET season_score = season_score + ? WHERE id = ?',
                        [$effective, $user->clan_id]
                    );
                }
            }
        });

        return response()->json([
            'ok'              => true,
            'received'        => count($request->visits),
            'new_discoveries' => $newDiscoveries,
        ]);
    }

    private function isChallengeValid(string $userId): bool
    {
        [$week, $year] = $this->getWeekNumber();
        $challenge = \App\Models\Challenge::where('week_number', $week)
            ->where('year', $year)
            ->first();

        if (!$challenge) return true;
        if (!$challenge->isExpired()) return true;

        return \App\Models\ChallengeCompletion::where('user_id', $userId)
            ->where('challenge_id', $challenge->id)
            ->exists();
    }

    private function getWeekNumber(): array
    {
        $now  = new \DateTime();
        $week = (int) $now->format('W');
        $year = (int) $now->format('o');
        return [$week, $year];
    }
}
```

### ClanController.php

```php
<?php

namespace App\Http\Controllers;

use App\Models\Clan;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ClanController extends Controller
{
    public function myInfo(Request $request)
    {
        $user = $request->user()->load('clan.members');
        if (!$user->clan) return response()->json(null);

        $rank = Clan::where('season_score', '>', $user->clan->season_score)->count() + 1;

        return response()->json([
            'id'           => $user->clan->id,
            'name'         => $user->clan->name,
            'faction'      => $user->clan->faction,
            'season_score' => $user->clan->season_score,
            'max_members'  => $user->clan->max_members,
            'rank'         => $rank,
            'is_leader'    => $user->clan->leader_id === $user->id,
            'members'      => $user->clan->members->map(fn($m) => [
                'id'       => $m->id,
                'username' => $m->username,
                'is_leader'=> $m->id === $user->clan->leader_id,
            ]),
        ]);
    }

    public function create(Request $request)
    {
        $request->validate([
            'name' => 'required|string|min:3|max:30|unique:clans,name',
        ]);

        $user = $request->user();
        if ($user->clan_id) {
            return response()->json(['error' => 'Quitte ton clan actuel avant d\'en créer un.'], 422);
        }

        $clan = DB::transaction(function () use ($request, $user) {
            $clan = Clan::create([
                'id'        => (string) Str::uuid(),
                'name'      => $request->name,
                'faction'   => $user->faction,
                'leader_id' => $user->id,
            ]);
            $user->update(['clan_id' => $clan->id]);
            return $clan;
        });

        return response()->json(['ok' => true, 'clan_id' => $clan->id]);
    }

    public function join(Request $request)
    {
        $request->validate(['clan_id' => 'required|uuid']);

        $user = $request->user();
        if ($user->clan_id) {
            return response()->json(['error' => 'Quitte ton clan actuel d\'abord.'], 422);
        }

        $clan = Clan::findOrFail($request->clan_id);

        if ($clan->faction !== $user->faction) {
            return response()->json(['error' => 'Faction incompatible.'], 422);
        }

        if ($clan->members()->count() >= $clan->max_members) {
            return response()->json(['error' => 'Clan complet.'], 422);
        }

        $user->update(['clan_id' => $clan->id]);
        return response()->json(['ok' => true]);
    }

    public function leave(Request $request)
    {
        $user = $request->user()->load('clan.members');
        if (!$user->clan) return response()->json(['ok' => true]);

        DB::transaction(function () use ($user) {
            $clan = $user->clan;
            $user->update(['clan_id' => null]);

            if ($clan->leader_id !== $user->id) return;

            $next = $clan->members()
                ->where('id', '!=', $user->id)
                ->orderByDesc('last_active_at')
                ->first();

            if ($next) {
                $clan->update(['leader_id' => $next->id]);
            } else {
                $clan->delete(); // Dernier membre
            }
        });

        return response()->json(['ok' => true]);
    }

    public function kick(Request $request, string $userId)
    {
        $leader = $request->user()->load('clan');
        abort_unless($leader->clan && $leader->clan->leader_id === $leader->id, 403);

        $target = User::where('id', $userId)
            ->where('clan_id', $leader->clan_id)
            ->firstOrFail();

        $target->update(['clan_id' => null]);
        return response()->json(['ok' => true]);
    }

    public function transfer(Request $request)
    {
        $request->validate(['new_leader_id' => 'required|uuid']);

        $leader = $request->user()->load('clan');
        abort_unless($leader->clan && $leader->clan->leader_id === $leader->id, 403);

        $newLeader = User::where('id', $request->new_leader_id)
            ->where('clan_id', $leader->clan_id)
            ->firstOrFail();

        $leader->clan->update(['leader_id' => $newLeader->id]);
        return response()->json(['ok' => true]);
    }
}
```

### ChallengeController.php

```php
<?php

namespace App\Http\Controllers;

use App\Models\Challenge;
use App\Models\ChallengeCompletion;
use Illuminate\Http\Request;

class ChallengeController extends Controller
{
    public function current(Request $request)
    {
        [$week, $year] = $this->getWeekNumber();
        $challenge = Challenge::where('week_number', $week)->where('year', $year)->first();
        if (!$challenge) return response()->json(null);

        $choices = collect($challenge->choices)->shuffle()->map(fn($c) => ['text' => $c['text']]);

        $completed = false;
        if ($request->user()) {
            $completed = $challenge->completedBy($request->user()->id);
        }

        return response()->json([
            'id'          => $challenge->id,
            'question'    => $challenge->question,
            'choices'     => $choices,
            'expires_at'  => $challenge->expires_at,
            'week_number' => $challenge->week_number,
            'year'        => $challenge->year,
            'completed'   => $completed,
        ]);
    }

    public function validate(Request $request)
    {
        $request->validate([
            'challenge_id' => 'required|uuid',
            'answer'       => 'required|string',
        ]);

        $challenge = Challenge::findOrFail($request->challenge_id);
        $userId    = $request->user()->id;

        if ($challenge->isExpired()) {
            return response()->json(['error' => 'Challenge expiré.', 'expired' => true], 410);
        }

        if ($challenge->completedBy($userId)) {
            return response()->json(['ok' => true, 'already_completed' => true, 'correct' => true]);
        }

        $correct = collect($challenge->choices)
            ->firstWhere('is_correct', true);

        $isCorrect = $correct && strtolower(trim($request->answer)) === strtolower(trim($correct['text']));

        if (!$isCorrect) {
            return response()->json(['ok' => false, 'correct' => false, 'message' => 'Mauvaise réponse. Réessaie !']);
        }

        ChallengeCompletion::create([
            'user_id'      => $userId,
            'challenge_id' => $challenge->id,
        ]);

        return response()->json(['ok' => true, 'correct' => true, 'message' => 'Bravo ! Tes visites sont validées.']);
    }

    private function getWeekNumber(): array
    {
        $now  = new \DateTime();
        return [(int) $now->format('W'), (int) $now->format('o')];
    }
}
```

---

## 9. Jobs planifiés (remplacent GitHub Actions)

```bash
php artisan make:job UpdateDominanceJob
php artisan make:job TakeSnapshotJob
php artisan make:job CleanupTerritoriesJob
php artisan make:job ManageEphemeralJob
php artisan make:job SeasonResetJob
php artisan make:job DetectAnomaliesJob
php artisan make:job CreateChallengeJob
```

### app/Console/Kernel.php (ou routes/console.php en Laravel 11)

```php
// routes/console.php
use Illuminate\Support\Facades\Schedule;

Schedule::job(new UpdateDominanceJob)->everyFifteenMinutes();
Schedule::job(new TakeSnapshotJob)->fourTimesDaily();
Schedule::job(new CleanupTerritoriesJob)->dailyAt('03:00');
Schedule::job(new ManageEphemeralJob)->weeklyOn(1, '06:00'); // Lundi 6h
Schedule::job(new CreateChallengeJob)->weeklyOn(1, '00:00'); // Lundi 0h
Schedule::job(new DetectAnomaliesJob)->everyThirtyMinutes();

// Season reset : lundi des semaines paires
Schedule::call(function () {
    if ((int)(new \DateTime())->format('W') % 2 === 0) {
        dispatch(new SeasonResetJob);
    }
})->weeklyOn(1, '00:05');
```

### Lancer le scheduler (cron système)

Ajouter une seule entrée cron sur le serveur :

```cron
* * * * * cd /var/www/netkingdoms && php artisan schedule:run >> /dev/null 2>&1
```

### UpdateDominanceJob.php (exemple)

```php
<?php

namespace App\Jobs;

use App\Models\Territory;
use App\Models\BrowseEvent;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;

class UpdateDominanceJob implements ShouldQueue
{
    use Dispatchable, Queueable;

    private const WINDOW_HOURS = 12;
    private const CONTEST_THRESHOLD = 0.10; // 10%

    public function handle(): void
    {
        $since = now()->subHours(self::WINDOW_HOURS);

        // Agrège les visites par domaine + faction sur 12h
        $counts = BrowseEvent::where('created_at', '>=', $since)
            ->where('flagged', false)
            ->selectRaw('domain, faction, COUNT(*) as cnt')
            ->groupBy('domain', 'faction')
            ->get()
            ->groupBy('domain');

        foreach ($counts as $domain => $factionCounts) {
            $total    = $factionCounts->sum('cnt');
            $dominant = $factionCounts->sortByDesc('cnt')->first();
            $second   = $factionCounts->sortByDesc('cnt')->skip(1)->first();

            $dominantFaction = $dominant->faction;
            $isContested     = $second && ($second->cnt / $total) >= self::CONTEST_THRESHOLD;

            Territory::where('domain', $domain)->update([
                'dominant_faction'     => $dominantFaction,
                'is_contested'         => $isContested,
                'last_dominant_update' => now(),
            ]);
        }
    }
}
```

### Lancer les workers de queue

```bash
php artisan queue:work --sleep=3 --tries=3 --daemon
```

> Utiliser **Supervisor** en production pour garder les workers actifs.

---

## 10. Middleware CORS

```bash
composer require fruitcake/laravel-cors  # déjà inclus en Laravel 11
```

Dans `bootstrap/app.php` :

```php
->withMiddleware(function (Middleware $middleware) {
    $middleware->statefulApi();
    $middleware->append(\Illuminate\Http\Middleware\HandleCors::class);
})
```

Dans `config/cors.php` :

```php
'paths'         => ['api/*', 'auth/*'],
'allowed_origins' => [env('FRONTEND_URL'), 'chrome-extension://*'],
'allowed_methods' => ['*'],
'allowed_headers' => ['Content-Type', 'Authorization', 'X-Signature', 'X-Visit-Mode', 'X-Anonymous-Id'],
```

---

## 11. Extension Chrome — adapter le `.env`

Remplacer dans `/extensions/NetKingdoms/.env` :

```env
# Ancien (Supabase)
VITE_SUPABASE_URL=https://hfqzsduezngpmxfplnfg.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
VITE_VISIT_ENDPOINT=https://...supabase.co/functions/v1/visit

# Nouveau (Laravel)
VITE_API_URL=https://votre-domaine.com/api
VITE_VISIT_ENDPOINT=https://votre-domaine.com/api/visits
VITE_WEBSITE_URL=https://votre-domaine.com
```

Dans `src/service-worker.ts`, l'envoi des visites utilise `BATCH_ENDPOINT` (déjà `VITE_VISIT_ENDPOINT`).

Pour l'auth, `X-Anonymous-Id` reste supporté — côté Laravel, ajouter la gestion dans `VisitController`:

```php
// Pour les visites anonymes (sans token Sanctum)
$userId = $request->header('X-Anonymous-Id') ?? 'anon-' . Str::uuid();
```

---

## 12. Déploiement

```bash
# Cloner le projet
git clone ... /var/www/netkingdoms
cd /var/www/netkingdoms

# Installer dépendances
composer install --no-dev --optimize-autoloader
npm install && npm run build  # si frontend dans le même repo

# Configurer
cp .env.example .env
php artisan key:generate
php artisan migrate --force
php artisan db:seed --class=SeasonSeeder

# Optimiser
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Permissions
chown -R www-data:www-data storage bootstrap/cache
chmod -R 775 storage bootstrap/cache
```

### Nginx (config minimale)

```nginx
server {
    listen 443 ssl;
    server_name votre-domaine.com;

    root /var/www/netkingdoms/public;
    index index.php;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }
}
```

### Supervisor (queue workers)

```ini
; /etc/supervisor/conf.d/netkingdoms.conf
[program:netkingdoms-worker]
command=php /var/www/netkingdoms/artisan queue:work --sleep=3 --tries=3
directory=/var/www/netkingdoms
autostart=true
autorestart=true
user=www-data
numprocs=2
```

```bash
supervisorctl reread && supervisorctl update && supervisorctl start netkingdoms-worker:*
```

---

## 13. Checklist de mise en production

- [ ] PostgreSQL créé + utilisateur avec les droits
- [ ] `.env` rempli (DB, OAuth providers, APP_URL)
- [ ] `php artisan migrate` sans erreur
- [ ] Season 1 seedée
- [ ] OAuth configuré (Google Console, Facebook Dev, GitHub Apps)
- [ ] Cron système `php artisan schedule:run` ajouté
- [ ] Supervisor configuré + workers actifs
- [ ] CORS configuré pour le domaine du frontend + `chrome-extension://*`
- [ ] Extension `.env` mis à jour avec les nouvelles URLs
- [ ] Extension rebuildée (`npm run build`) et rechargée dans Chrome
- [ ] Test : visite un site → vérifier ligne dans `browse_events`
- [ ] Test : connexion Google → token Sanctum généré → popup connecté

---

## 14. Résumé des endpoints — correspondance Supabase → Laravel

| Ancien (Supabase Edge Function) | Nouveau (Laravel) |
|---|---|
| `POST /functions/v1/visit` | `POST /api/visits` |
| `GET/POST /functions/v1/validate-challenge` | `GET /api/challenge` / `POST /api/challenge/validate` |
| `POST /functions/v1/clan-ops?action=create` | `POST /api/clan` |
| `POST /functions/v1/clan-ops?action=join` | `POST /api/clan/join` |
| `POST /functions/v1/clan-ops?action=leave` | `POST /api/clan/leave` |
| `POST /functions/v1/clan-ops?action=ladder` | `GET /api/ladder` |
| `GET /rest/v1/seasons?is_active=true` | `GET /api/season` |
| `GET /rest/v1/territories` | `GET /api/territories` |
| Supabase Auth magic link | `GET /auth/redirect/{provider}` |
