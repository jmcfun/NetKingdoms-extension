**NET KINGDOMS**

Game Design Document

*Version 2.0  —  Confidentiel*

| Concept : L'internet comme terrain de jeu. Ta navigation quotidienne fait gagner des territoires à ta faction en temps réel. Genre : MMO Passif — Territory Control — Browser Extension Plateforme : Chrome Extension (Manifest V3) \+ Backend Supabase Modèle : Free-to-play — Cosmétiques uniquement — Jamais Pay-to-Win Version : 2.0 — système simplifié, définitif |
| :---- |

# **Table des matières**

# **1\. Vision & Piliers de design**

## **1.1 Concept central**

Net Kingdoms transforme la navigation quotidienne en guerre territoriale mondiale. Chaque site visité contribue à la domination de ta faction sur ce domaine. La carte du jeu est construite en temps réel par les joueurs — un domaine n'existe que parce que quelqu'un l'a visité.

| La règle en une phrase "Je visite un site → ma faction progresse vers sa domination → si elle domine, elle gagne des points de saison toutes les 6h." |
| :---- |

## **1.2 Ce qui rend ce jeu unique**

| Dimension | Net Kingdoms | Concurrents (Bro-Mon, Dedalium) |
| :---- | :---- | :---- |
| Terrain de jeu | L'internet réel — chaque domaine existe | Carte fictive déconnectée |
| Action requise | Aucune — la navigation est le gameplay | Cliquer, interagir activement |
| Persistance | Monde permanent 24h/24 | Session-based |
| Social | Guerre de factions à l'échelle mondiale | Score individuel |
| Découverte | Les joueurs cartographient l'internet | Contenu pré-défini |

## **1.3 Piliers — règles absolues de design**

* **Zéro friction :** aucune action requise. Browser \= jouer.

* **Jamais Pay-to-Win :** aucun achat ne donne d'avantage compétitif en domination ou en points de saison.

* **Un joueur, une faction :** le choix de faction est permanent pour une saison. Il a du sens car il reflète le profil de navigation naturel du joueur.

* **Carte vivante :** la carte est construite par les visites réelles. Rien n'est pré-défini. Elle reflète l'activité actuelle.

* **Clans sociaux uniquement :** les clans ne capturent rien. Leur score est la somme des contributions individuelles de leurs membres.

# **2\. Factions**

## **2.1 Les trois factions**

À l'onboarding, le joueur choisit une faction. Ce choix est permanent pour toute la durée d'une saison (14 jours). Il peut changer au reset de saison. Le choix reflète son profil de navigation naturel.

|  | Les Fondeurs | Les Spectres | Les Nomades |
| :---- | :---- | :---- | :---- |
| Identité | Bâtisseurs, développeurs, créateurs | Influenceurs, curieux, lecteurs de médias | Explorateurs, cinéphiles, chasseurs de niche |
| Zone bonus | Tech & Dev | Social & News | Culture & Niche |
| Sites typiques | github, stackoverflow, npm, figma, notion | reddit, twitter/x, lemonde, hacker news | youtube, letterboxd, twitch, sites rares |
| Bonus de saison | \+50% pts sur sites Tech & Dev | \+50% pts sur sites Social & News | \+50% pts sur sites Culture & Niche |
| Couleur carte | Bleu | Violet | Vert |

## **2.2 Application du bonus de faction**

| Règle clé Le bonus s'applique aux POINTS DE SAISON uniquement — jamais à la domination. Dans la fenêtre de 12h, 1 visite \= 1 visite pour toutes les factions. L'équité de la domination est totale. Seule la récompense diffère. |
| :---- |

| Fondeurs dominent github.com (Tier S, Tech) → snapshot toutes les 6h :   Fondeurs  : 10 pts × 1.50 \= 15 pts de saison  ← bonus zone Tech   Spectres  : 10 pts × 1.00 \= 10 pts de saison  (pas de bonus sur Tech)   Nomades   : 10 pts × 1.00 \= 10 pts de saison  (pas de bonus sur Tech) Spectres dominent reddit.com (Tier A, Social) → snapshot :   Spectres  : 5 pts × 1.50 \= 7.5 pts de saison  ← bonus zone Social   Fondeurs  : 5 pts × 1.00 \= 5.0 pts de saison Sur un site hors zone (ex: Fondeurs dominent letterboxd) :   Fondeurs  : valeur\_tier × 1.00 \= points standards (pas de bonus) |
| :---- |

## **2.3 Équilibre inter-factions**

Les trois zones de bonus couvrent des types de navigation différents mais équivalents en volume de sites disponibles. Aucune zone ne donne un avantage structurel. Un Nomade peut conquérir GitHub — il gagnera simplement moins de points dessus qu'un Fondeur.

* Les sites sans catégorie claire (outils SaaS génériques, administrations, banques…) ne déclenchent aucun bonus de faction. Tous les joueurs y sont à égalité.

* Si une zone est structurellement surpeuplée (trop de joueurs d'une faction), les sites de cette zone ont naturellement plus de compétition — ce qui réduit la domination facile.

# **3\. Système de Domination — la mécanique centrale**

## **3.1 Principe**

La domination d'un territoire repose sur une fenêtre glissante de 12 heures. On compte le nombre de visites valides par faction sur un domaine dans cette fenêtre. La faction avec le plus de visites domine le territoire.

| domination(domaine, t) \= argmax{ visites\_faction(domaine, t-12h → t) } Si Fondeurs \= 47 visites | Spectres \= 23 | Nomades \= 8 sur les 12 dernières heures → Fondeurs dominent github.com État "Contesté" : écart entre 1er et 2ème \< 10% du total des visites → Les deux factions reçoivent une notification "territoire disputé" → Points de saison réduits de 50% pour le dominant (zone de guerre) |
| :---- |

## **3.2 La visite valide — définition technique**

| Condition | Valeur | Implémentation |
| :---- | :---- | :---- |
| Domaine normalisé | Seul le domaine racine compte. docs.github.com → github.com | chrome.webNavigation, URL parsing |
| Cooldown par joueur/domaine | 45 minutes minimum entre deux visites comptées sur le même domaine | chrome.storage.local timestamp |
| Dwell time | L'onglet doit être en focus actif ≥ 12 secondes | chrome.tabs.onActivated \+ timer |
| Velocity cap | Maximum 25 domaines uniques comptabilisés par heure | Sliding window locale |
| Frame | Uniquement le frame principal (frameId \=== 0). Iframes ignorés. | webNavigation filter |
| Schémas exclus | chrome://, file://, localhost, extensions, about: | URL scheme check |

## **3.3 Fenêtre glissante — implémentation**

| \-- Supabase : compter les visites par faction sur un domaine, fenêtre 12h SELECT faction, COUNT(\*) as visit\_count FROM browse\_events WHERE domain \= $1   AND created\_at \> NOW() \- INTERVAL '12 hours'   AND flagged \= FALSE GROUP BY faction ORDER BY visit\_count DESC LIMIT 1; \-- La faction avec visit\_count le plus élevé domine. \-- En cas d'égalité parfaite : territoire "Contesté", personne ne marque. |
| :---- |

## **3.4 Snapshots de points de saison**

| Paramètre | Valeur | Détail |
| :---- | :---- | :---- |
| Fréquence snapshot | Toutes les 6h | 00:00 / 06:00 / 12:00 / 18:00 UTC |
| Calcul | valeur\_tier × bonus\_faction | Appliqué à la faction dominante au moment du snapshot |
| Égalité au snapshot | 0 pt pour les deux | Pas de demi-points |
| Contesté au snapshot | 50% des points normaux | Récompense la domination partielle |
| Saison | 14 jours | 4 snapshots/jour × 14 jours \= 56 snapshots max par domaine par saison |

# **4\. La Carte — territoire de jeu**

## **4.1 Principe fondamental**

| La carte est générée par les joueurs Aucun domaine n'est pré-chargé. Un territoire n'existe sur la carte que parce qu'au moins un joueur l'a visité. La carte grandit organiquement avec la base de joueurs. Elle reflète l'internet tel que les joueurs le pratiquent réellement. |
| :---- |

## **4.2 Cycle de vie d'un territoire**

| État | Condition | Visuel sur la carte |
| :---- | :---- | :---- |
| Inconnu | Jamais visité par aucun joueur | N'apparaît pas |
| Découvert | Premier joueur vient de le visiter | Apparaît, couleur de la faction du découvreur |
| Dominé | Une faction a plus de visites que les autres sur 12h | Couleur pleine de la faction dominante |
| Contesté | Écart 1er/2ème \< 10% du total | Couleur striée des deux factions |
| Inactif | Zéro visite toutes factions depuis 48h | Grisé, badge "inactif" |
| Disparu | Inactif depuis 72h | Retiré de la carte automatiquement |

## **4.3 Mécanisme de découverte**

| SI domain NOT IN territories table :   → INSERT territories(domain, tier, zone, first\_seen\_by, first\_seen\_faction)   → La faction du découvreur possède le domaine par défaut      (ses visites comptent depuis t=0, les autres factions sont à 0\)   → Notification au joueur : "Tu as découvert \[domaine\] \! Ta faction le possède."   → Bonus cosmétique : badge "Explorateur" \+ 1 point de score de clan |
| :---- |

## **4.4 Classification des domaines (Tiers)**

La classification est déterminée automatiquement à la première apparition d'un domaine, puis mise en cache définitivement.

| Tier | Nom | Critère de classification | Valeur snapshot | Seuil "contesté" |
| :---- | :---- | :---- | :---- | :---- |
| S | Légendaire | Top 1000 domaines mondiaux (Alexa/SimilarWeb). github, youtube, reddit, wikipedia… | 10 pts | ±8% ou moins |
| A | Majeur | Top 10 000 mondiaux. stackoverflow, notion, figma, medium… | 5 pts | ±8% |
| B | Standard | Top 100 000\. Sites régionaux connus, outils spécialisés populaires. | 2 pts | ±10% |
| C | Régional | TLD régionaux (.fr, .de, .jp, .br…) et sites locaux connus. | 1 pt | ±10% |
| D | Niche | Tout autre domaine. Valeur fixée aléatoirement à la découverte (1-8 pts). | 1-8 pts | ±15% |

## **4.5 Classification par zone (catégorie)**

| Zone | Déclencheur bonus faction | Exemples de domaines |
| :---- | :---- | :---- |
| Tech & Dev | Fondeurs \+50% | github.com, gitlab.com, stackoverflow.com, npm.js, developer.mozilla.org, codepen.io, vercel.com, docker.com, linux.org, hackernews.com |
| Social & News | Spectres \+50% | reddit.com, twitter.com, linkedin.com, lemonde.fr, lefigaro.fr, bbc.com, reuters.com, hacker news, medium.com, substack.com |
| Culture & Niche | Nomades \+50% | youtube.com, twitch.tv, letterboxd.com, spotify.com, steam.com, itch.io, bandcamp.com, archive.org, sites Tier D rares |
| Neutre | Aucun bonus | Banques, administrations, SaaS génériques (google.com, dropbox.com, notion.so si outil généraliste) |

## **4.6 Catégorisation automatique**

1. Lookup dans la liste hardcodée initiale (\~2 000 domaines pré-classifiés au lancement).

2. Si absent : analyse du TLD \+ mots-clés du domaine (heuristique simple).

3. Si TLD régional (.fr, .de…) et non identifié : zone Neutre, Tier C.

4. Si domaine totalement inconnu (Tier D) : zone Culture & Niche par défaut, valeur aléatoire 1-8 pts.

5. La classification est permanente et non modifiable après insertion (évite la manipulation).

# **5\. Sites Éphémères**

## **5.1 Principe**

Chaque semaine, 3 à 5 domaines sont désignés comme "sites éphémères". Leur valeur de snapshot est multipliée par 5 pendant 48 heures. Cela crée un événement hebdomadaire qui pousse les joueurs à modifier temporairement leur navigation.

| Paramètre | Valeur |
| :---- | :---- |
| Fréquence | 1 fois par semaine (lundi 06:00 UTC) |
| Nombre de sites | 3 à 5 domaines |
| Durée | 48 heures (jusqu'au mercredi 06:00 UTC) |
| Multiplicateur | ×5 sur les points de snapshot uniquement |
| Annonce | Notification push \+ affichage sur le popup 6h avant le démarrage |
| Sélection | Algorithme : mélange de sites tendance réels \+ rotation équilibrée des zones |
| Anti-répétition | Un même domaine ne peut pas être éphémère deux semaines consécutives |

## **5.2 Sélection des sites éphémères**

Le système de sélection vise à choisir des domaines variés, stratégiquement disputés, et reflétant l'actualité réelle quand possible.

* 1 site Tier S (maximum de visibilité, maximum de compétition)

* 1-2 sites Tier A ou B (accessibles aux clans moins dominants)

* 1 site Tier D ou C rare (récompense les explorateurs et les Nomades)

* Rotation obligatoire : au moins une fois par mois, chaque zone bénéficie d'un éphémère

| points\_snapshot\_éphémère \= valeur\_tier × bonus\_faction × 5 Ex: Fondeurs dominent github.com pendant un événement éphémère (Tier S, zone Tech) :   10 pts × 1.5 (bonus Fondeurs) × 5 (éphémère) \= 75 pts par snapshot   vs 15 pts normalement → ×5 réel pour la faction en bonus |
| :---- |

# **6\. Système Anti-Triche**

## **6.1 Niveau 1 — Hard limits côté extension (non contournables sans modifier l'extension)**

### **Cooldown par joueur/domaine**

| Règle : minimum 45 minutes entre deux visites comptées sur le même domaine. stockage : chrome.storage.local\['cd'\]\[domain\] \= timestamp\_derniere\_visite\_valide check    : Date.now() \- chrome.storage.local\['cd'\]\[domain\] \>= 2\_700\_000 Visite 1 du jour : compte normalement (×1.0) Visite 2 (après 45 min) : compte normalement (×1.0) Visite 3+ (après 45 min) : compte normalement (×1.0) Note : il n'y a pas de pénalité sur les visites multiples (contrairement à la v1). Le cooldown seul suffit à bloquer le spam. Une visite toutes les 45 min est humain. |
| :---- |

### **Dwell time minimum**

| Règle : l'onglet doit être en focus actif (tab activé, fenêtre visible) ≥ 12 secondes. chrome.tabs.onActivated → démarre timer pour le tab actif window visibilitychange → suspend le timer si fenêtre cachée/minimisée Si dwell\_time \>= 12\_000ms → visite éligible au check cooldown Tabs ouverts en arrière-plan sans focus → ne comptent jamais. |
| :---- |

### **Cap de vélocité horaire**

| Règle : maximum 25 domaines uniques comptabilisés par fenêtre glissante de 60 minutes. Stockage : tableau glissant \[{ domain, timestamp }\] dans chrome.storage.local Purge des entrées \> 60 min à chaque nouvelle visite. Si COUNT(domaines uniques dans la fenêtre) \>= 25 → visite ignorée silencieusement. Aucun message d'erreur au joueur (évite les contournements intentionnels). |
| :---- |

## **6.2 Niveau 2 — Détection comportementale côté serveur**

| Détection | Seuil d'alerte | Action |
| :---- | :---- | :---- |
| Diversity score | \< 15% de domaines uniques sur 7j (ex: 85% des visites sur 2-3 sites) | Flag pour audit silencieux 48h |
| Multi-comptes IP | ≥ 4 comptes actifs sur le même IP hash dans 24h avec profils similaires | Flag pour audit (faux positifs possibles : bureau, université) |
| Spike de clan | \> 80% de l'activité d'un clan sur 1 domaine en moins de 2h | Flag clan pour audit |
| Velocity anormale côté serveur | \> 30 visites/h enregistrées malgré le cap local | Incohérence extension/serveur → flag automatique |

## **6.3 Échelle de sanctions**

| Niveau | Déclencheur | Action | Visible par le joueur |
| :---- | :---- | :---- | :---- |
| Shadow throttle | 1er flag comportemental | Visites comptées à 0 silencieusement | Non |
| Hold | 2ème flag ou flag clan | Visites en attente, non créditées pendant 48h max | Non |
| Reset | Bot confirmé par audit humain | Visites annulées rétroactivement depuis le flag | Email |
| Ban | Récidive confirmée | Token Supabase révoqué, extension désactivée côté serveur | Email obligatoire |

## **6.4 Kingdom Challenge hebdomadaire**

Une fois par semaine (lundi 00:00 UTC), un puzzle simple est requis pour valider les visites de la semaine à venir. Types : identifier le logo d'un site parmi 4, compléter un pattern. Non résolu en 72h → visites de la semaine non créditées (pas d'expulsion du jeu).

# **7\. Sécurité — Protection contre le tampering**

## **12.1 Modèle de menace**

Un joueur peut décompresser l'extension Chrome (qui est un zip non chiffré) et modifier le code JavaScript côté client. Il peut aussi capturer les requêtes réseau via un proxy (Charles, Burp Suite). Ces deux vecteurs sont les principales menaces.

| Principe fondamental — ne jamais faire confiance au client Toutes les règles de jeu sont vérifiées côté serveur, indépendamment du client. Le service worker implémente les mêmes règles pour la performance UX et réduire le trafic — mais le serveur ne fait confiance à aucune donnée reçue sans vérification indépendante. |
| :---- |

| Vecteur d'attaque | Ce que l'attaquant peut faire | Ce qu'il ne peut pas faire |
| :---- | :---- | :---- |
| Dépaquetage de l'extension | Supprimer les checks cooldown/dwell/velocity côté client. Envoyer des batches forgés plus fréquemment. | Modifier le serveur Supabase. Forger un token d'auth valide. Distribuer sa version modifiée via le Chrome Web Store (signature Google obligatoire). |
| Replay de requêtes (proxy) | Rejouer une requête capturée plusieurs fois. | Modifier le payload sans invalider la signature HMAC (voir 7.2). Réutiliser un nonce déjà consommé (voir 7.3). |
| Création de faux comptes | Créer plusieurs comptes pour multiplier les visites. | Créer des comptes sans adresse email valide (magic link obligatoire). Passer le progressive trust des 7 premiers jours sans comportement humain. |

## **12.2 Signature HMAC des batches**

Chaque batch envoyé par l'extension est signé avec HMAC-SHA256. Le serveur vérifie la signature avant tout traitement. Un payload modifié en transit ou par un client altéré produit une signature invalide → rejet immédiat.

| // Côté extension (service worker) — signature du batch const payload \= JSON.stringify({ visits, timestamp: Date.now(), nonce }); const key \= await deriveKey(supabaseToken);  // clé dérivée du token auth const signature \= await hmacSHA256(key, payload); fetch(FUNCTION\_URL, {   method: 'POST',   headers: {     'Authorization': 'Bearer ' \+ supabaseToken,     'X-Signature': signature,     'Content-Type': 'application/json'   },   body: payload }); // Côté Edge Function Supabase — vérification const expectedSig \= await hmacSHA256(deriveKey(token), rawBody); if (expectedSig \!== req.headers\['x-signature'\]) {   return new Response('Invalid signature', { status: 401 }); } |
| :---- |

| Pourquoi c'est solide La clé de dérivation est le token Supabase de l'utilisateur — un secret que l'attaquant possède certes, mais qui est lié à son compte. Il ne peut pas forger des visites pour un AUTRE joueur. Et forger des visites pour son propre compte est déjà détecté par l'analyse comportementale (Section 6.2). |
| :---- |

## **12.3 Système de nonce — protection anti-replay**

Le serveur émet un nonce à chaque réponse de batch. Le batch suivant doit inclure ce nonce. Un nonce déjà consommé \= requête rejetée. Rejouer une requête capturée est donc impossible.

| // Réponse du serveur après chaque batch : { "ok": true, "next\_nonce": "a3f8c2d1e9b4..." } // L'extension stocke le nonce reçu : chrome.storage.local.set({ 'next\_nonce': data.next\_nonce }); // Le batch suivant l'inclut obligatoirement : const payload \= JSON.stringify({ visits, timestamp, nonce: storedNonce }); // Côté serveur : vérification et invalidation immédiate const valid \= await consumeNonce(userId, nonce);  // atomique en DB if (\!valid) return new Response('Nonce already used', { status: 409 }); |
| :---- |

## **8.4 Miroir serveur des règles client**

Toutes les règles anti-triche implémentées côté client sont dupliquées côté serveur de façon indépendante. Le client qui a supprimé ses propres checks se retrouve bloqué par le miroir serveur sans le savoir.

| Règle client | Miroir serveur | Stockage serveur |
| :---- | :---- | :---- |
| Cooldown 45min par domaine | Vérification dans browse\_events : aucune visite valide pour ce user+domain dans les 45 dernières minutes | browse\_events.created\_at \+ index (user\_id, domain) |
| Velocity cap 25/h | Comptage des visites dans browse\_events sur la fenêtre 60min glissante | Requête COUNT sur browse\_events |
| Max 1 visite/domaine toutes les 45min | Identique au cooldown — double vérification | Idem |
| Dwell time 12s | Non vérifiable côté serveur — compensé par l'analyse comportementale (diversity score) | browse\_events.flagged |

## **8.5 Obfuscation du code client**

Le code JavaScript de l'extension est obfusqué à chaque build via Terser avec les options maximales. Cela ne protège pas contre un attaquant déterminé, mais filtre 95% des tentatives amateurs et augmente significativement le coût du reverse engineering.

| // vite.config.ts — options de minification Terser build: {   minify: 'terser',   terserOptions: {     compress: {       passes: 3,       unsafe: true,       drop\_console: true,    // supprime tous les console.log     },     mangle: {       toplevel: true,        // renomme les variables top-level       properties: {         regex: /^\_/          // renomme les propriétés préfixées \_       }     },   } } |
| :---- |

## **7.6 Integrity check au démarrage**

Au démarrage du service worker, l'extension calcule le hash de son propre code et le compare à un hash de référence fourni par le serveur. Si le hash ne correspond pas (extension modifiée), elle se désactive et affiche un message à l'utilisateur.

| // service-worker.js — vérification d'intégrité au démarrage self.addEventListener('install', async () \=\> {   const myHash \= await computeOwnHash();   const { expected\_hash } \= await fetch(FUNCTION\_URL \+ '/integrity').then(r \=\> r.json());   if (myHash \!== expected\_hash) {     await chrome.action.setBadgeText({ text: 'ERR' });     await chrome.action.setBadgeBackgroundColor({ color: '\#E24B4A' });     // L'extension ne traite plus aucune visite     self.registration.unregister();   } }); // Note : contournable par un attaquant qui supprime ce check. // La vraie protection reste HMAC \+ nonce \+ miroir serveur. // Ce check filtre les modifications accidentelles et les amateurs. |
| :---- |

## **7.7 Progressive trust — nouveaux comptes**

Les comptes créés depuis moins de 7 jours ont un score de confiance réduit. Leurs visites sont comptabilisées normalement dans la fenêtre de domination, mais leur contribution au score de clan est réduite de 50%. Cela limite l'impact des comptes créés pour farmer rapidement puis être abandonnés.

| score\_clan\_contribution \= visites\_valides × trust\_multiplier trust\_multiplier :   compte \< 7 jours   → 0.50   compte 7-30 jours  → 0.75   compte \> 30 jours  → 1.00 La domination territoriale n'est PAS affectée par trust\_multiplier. Seul le score de clan est impacté — évite de pénaliser la faction. |
| :---- |

## **7.8 Ce qui reste impossible à protéger — et pourquoi c'est acceptable**

| Menace résiduelle | Raison | Mitigation pragmatique |
| :---- | :---- | :---- |
| Un attaquant supprime le check d'intégrité ET le HMAC ET les checks cooldown locaux | Requiert une expertise technique élevée et un investissement de temps significatif | L'analyse comportementale détecte le résultat (diversity score). Le ratio effort/gain pour le tricher est défavorable. |
| Ferme de comptes avec emails jetables (un email par compte) | Impossible à distinguer d'utilisateurs légitimes à l'inscription | Progressive trust \+ diversity score éliminent les fermes en 7 jours |
| Navigateur entièrement automatisé (Selenium/Playwright) | Le dwell time et la gestion des tabs peuvent être simulés | Pattern de navigation parfaitement régulier → flag diversity score \+ spike clan |

# **8\. Clans**

## **12.1 Rôle des clans**

| Principe fondamental Les clans sont des entités sociales. Ils ne capturent aucun territoire et n'ont aucun effet sur la domination. Leur score est la somme des visites valides de leurs membres. Ils offrent un classement parallèle et un contexte social pour les joueurs de la même faction. |
| :---- |

## **12.2 Score de clan**

| score\_clan \+= 1 par visite valide d'un membre (toutes factions) Conditions :   \- La visite doit passer tous les filtres anti-triche (cooldown, dwell, velocity)   \- Le membre doit être dans le clan au moment de la visite   \- Cumulé sur toute la durée de la saison (remis à 0 au reset) score\_clan est indépendant du score de faction. Un petit clan très actif peut dépasser un grand clan passif. |
| :---- |

## **12.3 Structure et règles**

| Paramètre | Valeur gratuite | Extension payante |
| :---- | :---- | :---- |
| Membres max | 5 | \+ 5 par palier (achat unique 2€/palier, permanent pour le clan) |
| Création | Gratuit | — |
| Faction | Obligatoirement la même pour tous les membres | — |
| Ladder | Oui, classement global toutes factions | — |
| Classement par faction | Oui, top clan par faction | — |
| Récompenses | Badge saisonnier top 3 par faction | — |

## **8.4 Règles de fonctionnement**

* Un clan appartient à une seule faction. Impossible de mélanger les factions.

* Un joueur ne peut appartenir qu'à un seul clan à la fois.

* Quitter un clan ne retire pas les points déjà contribués au score du clan (déjà comptabilisés).

* Succession du chef : si le chef est inactif 14 jours, le membre le plus actif (score le plus élevé sur 30j) prend la tête automatiquement.

* Dissolution : si tous les membres sont inactifs 30 jours, le clan est dissous. Les ex-membres peuvent en recréer un.

* Pas de chat intégré dans l'extension. La coordination se fait via les outils externes choisis par le clan (Discord, WhatsApp, etc.).

## **8.5 Monétisation des clans**

| Palier 0 (gratuit)  : 5 membres Palier 1 (+2€ once) : 10 membres Palier 2 (+4€ once) : 15 membres Palier N (+2N€ once): 5 \+ N×5 membres Paiement unique (one-shot), non récurrent. Facturation au chef du clan via Stripe. Si le clan est dissous et recréé : les paliers doivent être rachetés. Les paliers ne confèrent aucun avantage compétitif sur la domination ou les points. |
| :---- |

# **9\. Saisons**

## **12.1 Paramètres**

| Paramètre | Valeur | Rationale |
| :---- | :---- | :---- |
| Durée | 14 jours | Court pour le FOMO, assez long pour la stratégie |
| Début | Lundi 00:00 UTC | Prévisible, maximise l'engagement weekend |
| Annonce fin de saison | J-48h et J-24h (notifications push) | Re-engage les joueurs passifs |
| Score de faction | Cumul des snapshots de la saison | Domination × durée |
| Score de clan | Cumul des visites valides de tous les membres | Activité collective |
| Classement individuel | Non public — visible uniquement dans le clan | Évite la toxicité |
| Reset des scores | Total à 0 au début de chaque saison | Fresh start pour tous |

## **12.2 Ce qui se passe au reset**

| Élément | Action | Détail |
| :---- | :---- | :---- |
| Score de faction | Archivé \+ remis à 0 | Historique conservé et consultable |
| Score de clan | Archivé \+ remis à 0 | Par saison dans le profil du clan |
| Territoires sur la carte | Conservés (la carte persiste) | Les domaines découverts restent connus |
| Domination actuelle | Remise à zéro (fenêtre 12h vide) | Tout le monde repart à égalité |
| Clans | Conservés | Les clans et membres persistent |
| Paliers clan payants | Conservés | L'achat est définitif |
| Badges et cosmétiques | Conservés | Acquis définitivement |

## **12.3 Récompenses de saison**

| Rang | Récompense | Permanence |
| :---- | :---- | :---- |
| \#1 Faction de saison | Skin terrain "Conquérant" \+ titre saisonnier pour tous ses membres | Permanente |
| Top 3 clans par faction | Badge de clan exclusif \+ skin couleur unique | Permanente |
| Top 10% clans (global) | Badge de profil saisonnier | Jusqu'à la saison suivante |
| Participation (≥1 territoire dominé) | Badge "Explorateur S\[n\]" | Permanente |

# **10\. Monétisation**

| Deux règles absolues 1\. Jamais Pay-to-Win : aucun achat ne peut influencer la domination, les visites comptées, ou les points de saison. 2\. La privacy est gratuite et par défaut : la protection des données de navigation est un fondement de la confiance, pas un produit premium. Elle ne peut jamais être conditionnée à un paiement. |
| :---- |

## **12.1 Privacy by default — non négociable**

Net Kingdoms accède à la navigation des utilisateurs. Ce privilège impose des obligations strictes, indépendamment de tout modèle économique.

| Principe | Implémentation technique | Vérifiable par l'utilisateur |
| :---- | :---- | :---- |
| Seul le domaine racine est collecté | URL parsing : extraire uniquement le eTLD+1. Jamais le chemin, jamais les paramètres, jamais le contenu. | Open source du service worker |
| Jamais de lecture du contenu de page | Content scripts désactivés. L'extension n'injecte rien dans les pages. | Permissions déclarées dans manifest.json |
| Purge automatique des événements | browse\_events supprimés 30 jours après création. CRON quotidien côté Supabase. | Politique de confidentialité publique |
| Pas de vente de données | Aucune donnée transmise à des tiers. Le jeu est le seul usage. | Politique de confidentialité publique |
| Droit à l'oubli | Suppression de compte \+ toutes les données en \< 72h sur demande email. | Processus documenté dans les CGU |

## **12.2 Produits**

| Produit | Prix | Type | Contenu |
| :---- | :---- | :---- | :---- |
| Pass de Saison | 2,99€/mois | Abonnement mensuel | Skin territoire exclusif de saison, titre de profil animé, historique de stats personnel 30j, accès early aux annonces d'éphémères (+1h avant les autres). |
| Extension Clan | 2€/palier | Achat unique (one-shot) | Déblocage permanent de \+5 membres pour le clan. Cumulable. Facturé au chef du clan. |
| Cosmétiques | 0,99-4,99€ | Achat unique | Skins de territoire (couleurs alternatives, animations de domination), thèmes de popup/new tab, avatars de faction rares. |

## **12.3 Ce qui reste toujours gratuit**

* 100% du gameplay (domination, saisons, factions, clans, ladders)

* Accès à la carte mondiale complète

* Notifications de territoires contestés

* Création et appartenance à un clan (jusqu'à 5 membres)

* Participation aux sites éphémères et aux découvertes

* Tous les classements (faction et clan)

* La protection de la vie privée — intégralement, sans exception

# **11\. Interface utilisateur**

## **12.1 Point d'entrée principal — le Popup**

Le popup (clic sur l'icône de l'extension dans la toolbar Chrome) est le hub principal du jeu. Accessible en un clic depuis n'importe quel onglet, à tout moment. Le new tab override est proposé à l'installation mais reste optionnel.

| Zone du popup | Contenu | Mise à jour |
| :---- | :---- | :---- |
| Header | Nom du joueur, faction (couleur \+ nom), nom du clan | Statique |
| Mes territoires | Liste des domaines où ta faction domine actuellement, avec tier et points projetés | Polling 60s |
| Contestés | Sites où ta faction est en situation ≤10% d'écart — avec le nom du domaine à visiter | Polling 30s |
| Sites éphémères actifs | Domaines boostés ×5, avec timer de fin | Statique 5min |
| Score de saison | Score faction actuel \+ rang \+ score clan \+ rang clan | Polling 5min |
| Découvertes récentes | Derniers domaines découverts par ta faction | Polling 60s |

## **12.2 New Tab (optionnel)**

Si activé, la page de nouvel onglet affiche une version étendue du popup avec la carte des territoires (grille par tier et zone, colorée par faction), le leaderboard de saison faction et clan, et le feed d'activité global (dernières captures, découvertes, éphémères en cours).

## **12.3 États de l'icône de l'extension**

| État | Apparence | Condition |
| :---- | :---- | :---- |
| Normal | Icône couleur faction | Aucun événement actif |
| Contesté | Badge orange avec compteur | Au moins un territoire de ta faction est contesté |
| Éphémère actif | Anneau doré autour de l'icône | Un site éphémère est en cours |
| Inactif | Icône grisée | Aucune visite valide enregistrée depuis 24h |

## **12.4 Onboarding — flux complet**

6. **Installation :** Page de bienvenue s'ouvre automatiquement en nouvel onglet.

7. **Email :** Magic link uniquement. Pas de mot de passe. Pas d'OAuth (anti-bot).

8. **Choix de faction :** 3 cartes avec identité, exemples de sites, et bonus clairement expliqués. Choix définitif pour la saison.

9. **Nom :** Pseudo 3-20 caractères alphanumérique.

10. **Permission notifications :** Demandée ici avec explication claire du bénéfice (alertes "territoire contesté").

11. **Premier territoire :** L'extension guide : "Browse 3 sites pour apparaître sur la carte". Overlay sur le popup jusqu'à la 1ère domination.

# **12\. Architecture technique**

## **12.1 Stack**

| Composant | Technologie | Rôle |
| :---- | :---- | :---- |
| Extension UI | React \+ Vite \+ TypeScript | Popup \+ New Tab page. Build MV3 compatible. |
| Service Worker | Vanilla JS (pas de lib) | MV3 interdit les imports ESM. Détection domaines, cooldowns, batch. |
| Backend | Supabase (PostgreSQL \+ Edge Functions \+ Realtime) | Base de données, calculs, temps réel. |
| Auth | Supabase Auth — magic link email | Anti-bot. Pas de création en masse possible. |
| Paiements | Stripe \+ Supabase Webhook | Pass de saison \+ extension clan. |
| Notifications | Chrome Push API | Notifications natives. Permission requise. |

## **12.2 Tables Supabase — schéma complet**

### **users**

| Colonne | Type | Description |
| :---- | :---- | :---- |
| id | UUID PK (Supabase Auth) | Identifiant unique |
| faction | ENUM(fondeurs,spectres,nomades) NOT NULL | Faction choisie |
| clan\_id | UUID FK → clans.id NULLABLE | Clan actuel |
| season\_score | INTEGER DEFAULT 0 | Score personnel de saison (non public) |
| created\_at | TIMESTAMPTZ DEFAULT NOW() |  |
| last\_active\_at | TIMESTAMPTZ | Mis à jour à chaque batch reçu |

### **clans**

| Colonne | Type | Description |
| :---- | :---- | :---- |
| id | UUID PK |  |
| name | TEXT NOT NULL UNIQUE | 3-20 caractères |
| faction | ENUM NOT NULL | Faction du clan |
| leader\_id | UUID FK → users.id NOT NULL | Chef actuel |
| max\_members | INTEGER DEFAULT 5 | 5 \+ paliers × 5 |
| paid\_tiers | INTEGER DEFAULT 0 | Nombre de paliers achetés |
| stripe\_payment\_ids | TEXT\[\] DEFAULT {} | IDs des paiements one-shot |
| season\_score | INTEGER DEFAULT 0 | Score cumulé de la saison |
| created\_at | TIMESTAMPTZ DEFAULT NOW() |  |

### **territories**

| Colonne | Type | Description |
| :---- | :---- | :---- |
| domain | TEXT PK | Domaine normalisé (ex: github.com) |
| tier | ENUM(S,A,B,C,D) NOT NULL | Tier calculé à la découverte |
| zone | ENUM(tech,social,culture,neutre) NOT NULL | Zone calculée à la découverte |
| value\_snapshot | SMALLINT NOT NULL | Points par snapshot (1-10, Tier D: aléatoire 1-8) |
| dominant\_faction | ENUM NULLABLE | Faction dominante actuelle (null \= personne) |
| is\_contested | BOOLEAN DEFAULT FALSE | Écart ≤ 10% entre 1er et 2ème |
| is\_ephemeral | BOOLEAN DEFAULT FALSE | Site éphémère actif |
| first\_seen\_by | UUID FK → users.id | Joueur qui l'a découvert |
| first\_seen\_faction | ENUM | Faction du découvreur |
| first\_seen\_at | TIMESTAMPTZ | Date de découverte |
| last\_visit\_at | TIMESTAMPTZ | Dernière visite toutes factions. Purge si \> 72h. |
| last\_dominant\_update | TIMESTAMPTZ | Dernier recalcul de dominance |

### **browse\_events (partitionné par jour, purgé après 30 jours)**

| Colonne | Type | Description |
| :---- | :---- | :---- |
| id | UUID PK |  |
| user\_id | UUID FK → users.id |  |
| domain | TEXT | Domaine normalisé (haché si mode Privacy) |
| faction | ENUM | Faction du joueur au moment de la visite |
| clan\_id | UUID NULLABLE | Clan du joueur au moment de la visite |
| created\_at | TIMESTAMPTZ | Clé de partition |
| flagged | BOOLEAN DEFAULT FALSE | Anti-triche : si TRUE, visite ignorée des calculs |

### **season\_snapshots (log immuable)**

| Colonne | Type | Description |
| :---- | :---- | :---- |
| id | UUID PK |  |
| season\_id | UUID FK | Saison concernée |
| domain | TEXT | Territoire snapshottté |
| dominant\_faction | ENUM | Faction dominante au moment du snapshot |
| points\_awarded | INTEGER | Points accordés (après bonus faction) |
| is\_contested | BOOLEAN | Si territoire était contesté |
| is\_ephemeral | BOOLEAN | Si territoire était éphémère |
| snapshotted\_at | TIMESTAMPTZ | Timestamp exact |

## **12.3 Edge Functions Supabase**

| Fonction | Déclencheur | Responsabilités |
| :---- | :---- | :---- |
| process-batch | POST extension (toutes les 5 min) | Valide les visites (caps serveur), insère dans browse\_events, met à jour last\_active\_at, incrémente score de clan |
| update-dominance | CRON toutes les 15 min | Recalcule dominant\_faction pour chaque territoire actif (fenêtre 12h), met à jour is\_contested |
| take-snapshot | CRON 00:00/06:00/12:00/18:00 UTC | Pour chaque territoire dominé : calcule points avec bonus faction \+ éphémère, insère dans season\_snapshots, met à jour scores faction et clan |
| cleanup-territories | CRON quotidien | Marque inactif si last\_visit\_at \> 48h. Supprime si \> 72h. |
| season-reset | CRON lundi 00:00 UTC | Archive scores, remet à 0, envoie notifications de fin de saison |
| manage-ephemeral | CRON lundi 06:00 UTC | Sélectionne et active les sites éphémères de la semaine |
| detect-anomalies | CRON toutes les 30 min | Calcule diversity scores, détecte multi-comptes, flags clans suspects |
| stripe-webhook | POST Stripe | Active les paliers clan après paiement one-shot |

## **12.4 Service Worker MV3 — logique principale**

| // 1\. Interception de navigation chrome.webNavigation.onCommitted.addListener(async ({ url, tabId, frameId }) \=\> {   if (frameId \!== 0\) return;   const domain \= normalizeDomain(url);        // extraire domaine racine   if (\!domain || isExcluded(domain)) return;  // exclure chrome://, localhost, etc.   // Anti-triche niveau 1   if (\!await checkDwellTime(tabId, 12\_000)) return;  // 12s focus actif   if (\!await checkCooldown(domain, 2\_700\_000)) return; // 45min par domaine   if (\!await checkVelocity(25)) return;        // max 25 domaines/h   await queueVisit({ domain, timestamp: Date.now() }); }, { url: \[{ schemes: \['https', 'http'\] }\] }); // 2\. Envoi batch toutes les 5 minutes chrome.alarms.create('sync', { periodInMinutes: 5 }); chrome.alarms.onAlarm.addListener(async ({ name }) \=\> {   if (name \!== 'sync') return;   const visits \= await drainQueue();   if (\!visits.length) return;   await fetch(SUPABASE\_FUNCTION\_URL \+ '/process-batch', {     method: 'POST',     headers: { Authorization: 'Bearer ' \+ token, 'Content-Type': 'application/json' },     body: JSON.stringify({ visits }),   }); }); |
| :---- |

# **13\. Constantes d'équilibrage**

Toute modification de ces valeurs doit être testée sur 10% de la base avant déploiement général.

| Constante | Valeur actuelle | Plage testable | Impact si augmenté |
| :---- | :---- | :---- | :---- |
| VISIT\_COOLDOWN\_MS | 2 700 000 (45 min) | 1 800 000 – 7 200 000 | Moins de visites/joueur, moins de grinding |
| DWELL\_TIME\_MIN\_MS | 12 000 (12 sec) | 5 000 – 30 000 | Plus dur à tricher par script |
| VELOCITY\_CAP\_PER\_HOUR | 25 domaines | 15 – 40 | Pénalise les power users légitimes si trop bas |
| DOMINATION\_WINDOW\_H | 12 heures | 6 – 24 | Fenêtre courte \= plus dynamique, plus volatile |
| SNAPSHOT\_INTERVAL\_H | 6 heures | 3 – 12 | Plus fréquent \= carte plus réactive |
| FACTION\_BONUS\_MULTIPLIER | 1.50 (×1.5) | 1.20 – 2.00 | Trop élevé \= obligatoire de jouer sa zone |
| CONTESTED\_THRESHOLD\_PCT | 10% | 5 – 20 | Trop large \= tout est contesté |
| EPHEMERAL\_MULTIPLIER | 5 | 3 – 10 | Impact des éphémères sur le classement |
| TERRITORY\_INACTIVE\_H | 48 | 24 – 96 | Durée avant disparition progressive |
| TERRITORY\_PURGE\_H | 72 | 48 – 168 | Durée avant suppression définitive |
| SEASON\_DURATION\_DAYS | 14 | 7 – 21 | FOMO et rythme général du jeu |
| DISCOVERY\_BONUS\_CLAN | 1 pt | 0 – 5 | Incitation à explorer des sites inconnus |

# **14\. Cas limites & règles de résolution**

| Cas | Règle de résolution |
| :---- | :---- |
| Égalité parfaite dans la fenêtre 12h | Territoire "Contesté". 0 point au snapshot si égalité absolue. Si écart ≤ 10% : points réduits de 50% pour le dominant. |
| Joueur change de faction en cours de saison | Impossible en cours de saison. Changement uniquement au reset. Ses visites passées restent créditées à son ancienne faction. |
| Joueur quitte un clan en cours de saison | Son score de clan acquis reste au clan. Ses futures visites vont à son nouveau clan (ou à aucun s'il est sans clan). |
| Domaine avec redirect (301) | On utilise le domaine final après redirect. Un redirect 302 (temporaire) utilise le domaine d'origine. |
| Domaine HTTPS → HTTP | Toujours normalisé en domaine racine sans schéma. github.com et http://github.com → même territoire. |
| Sous-domaine | Ignoré : docs.github.com → github.com. Exception : sous-domaines universitaires (\*.edu, \*.ac.uk) comptent séparément. |
| Snapshot pendant une transition de dominance | On utilise l'état à l'instant T du snapshot. Pas de rétroactivité. |
| Site éphémère qui devient inactif | L'éphémère est retiré de la liste. Ses points déjà accordés ne sont pas retirés. |
| Joueur banné en cours de saison | Toutes ses visites depuis le dernier flag sont annulées. Le score de clan est recalculé en soustrayant sa contribution depuis le flag. |
| Clan chef inactif 14j pendant une saison active | Succession automatique au membre avec le plus de visites valides sur 30j. Notification au nouveau chef par email. |
| Reset de saison à 00:00 pendant une fenêtre de 12h active | La fenêtre est clôturée et les données archivées avant le reset. La nouvelle fenêtre repart à zéro. |
| Deux joueurs du même foyer (même IP) | Autorisé. Le seuil de flag multi-comptes est ≥ 4 comptes sur la même IP, pas 2\. Un audit humain confirme. |

# **15\. Roadmap d'implémentation**

## **Phase 1 — Semaines 1-4 : Fondation**

| Objectif L'extension détecte les domaines et envoie des visites valides à Supabase. Un joueur peut créer un compte, choisir une faction, et voir ses contributions. |
| :---- |

| Semaine | Tâches | Livrable |
| :---- | :---- | :---- |
| S1 | Setup Vite \+ React \+ TypeScript pour l'extension. Service worker MV3 vanilla JS. Détection chrome.webNavigation. Normalisation de domaines. Listes d'exclusion (localhost, chrome://, etc.). | Extension installable qui log les domaines |
| S2 | Cooldown 45min, dwell time 12s, velocity cap 25/h. File locale (chrome.storage). Batch toutes les 5min vers Supabase Edge Function v0 (log brut). | Extension qui envoie des événements valides |
| S3 | Supabase : tables users, clans, territories, browse\_events. Auth magic link. Edge Function process-batch v1. Classification automatique des domaines. | Visites enregistrées en base |
| S4 | Popup React v1 : faction, domaines visités aujourd'hui, pas encore de carte. Onboarding complet. Tests end-to-end. | MVP fonctionnel — Milestone 1 |

## **Phase 2 — Semaines 5-8 : Domination & Carte**

| Objectif La carte existe. Les factions dominent des territoires. Les snapshots accordent des points. Le classement de saison est visible. |
| :---- |

| Semaine | Tâches | Livrable |
| :---- | :---- | :---- |
| S5 | Edge Function update-dominance (CRON 15min). Edge Function take-snapshot (CRON 6h). Bonus de faction dans le calcul. Table season\_snapshots. | Domination et points fonctionnels |
| S6 | Carte sur le popup : liste de territoires par tier, colorée par faction. État contesté. Découverte de territoire (première visite). | Carte visible et interactive |
| S7 | Système éphémère : Edge Function manage-ephemeral, UI popup, notifications. | Sites éphémères opérationnels |
| S8 | Clans : création, invitation, score de clan, ladder. Edge Function cleanup-territories. Tests charge. | Milestone 2 — Gameplay complet |

## **Phase 3 — Semaines 9-12 : Rétention & Monétisation**

| Objectif Saisons, anti-triche complet, monétisation, polish UX. Prêt pour le lancement public. |
| :---- |

| Semaine | Tâches | Livrable |
| :---- | :---- | :---- |
| S9 | Edge Function season-reset. Récompenses cosmétiques. Historique des saisons. Badges de profil. | Saisonnalité opérationnelle |
| S10 | Anti-triche Niveau 2 (detect-anomalies). Kingdom Challenge hebdomadaire. Dashboard admin anti-triche. | Système anti-triche complet |
| S11 | Stripe : Pass de Saison (2,99€/mois) \+ Extension Clan (2€ one-shot). Mode Privacy (1,99€/mois). Cosmétiques v1. | Monétisation opérationnelle |
| S12 | Beta fermée 200-500 joueurs. Équilibrage des constantes. Fix bugs. Soumission Chrome Web Store. | Milestone 3 — Launch Ready |

## **Backlog post-lancement (V1.1+)**

* **New tab visuel :** Carte type treemap ou réseau — visualisation graphique des territoires.

* **Extension Firefox :** Port MV3. Architecture identique, packaging différent.

* **API publique read-only :** Stats de factions et territoires sans données personnelles — pour les sites communautaires tiers.

* **Événements saisonniers :** Double points week-ends, invasions cross-zone, éphémères spéciaux (actualité).

* **Classements thématiques :** "Qui domine la zone Tech ?" / "Meilleur clan Nomades" — en plus du classement global.

# **Appendice — Formules de référence rapide**

| ─── DOMINATION ──────────────────────────────────────────────────── dominant(domaine) \= argmax { count(visites faction X, dernières 12h) } contesté          \= si écart entre 1er et 2ème ≤ 10% du total ─── SNAPSHOT (toutes les 6h) ────────────────────────────────────── pts\_snapshot \= valeur\_tier × bonus\_faction × multiplicateur\_éphémère bonus\_faction :   zone Tech   → Fondeurs ×1.5, Spectres ×1.0, Nomades ×1.0   zone Social → Fondeurs ×1.0, Spectres ×1.5, Nomades ×1.0   zone Culture→ Fondeurs ×1.0, Spectres ×1.0, Nomades ×1.5   zone Neutre → toutes factions ×1.0 multiplicateur\_éphémère : ×5 si site éphémère actif, sinon ×1 si contesté             : pts\_snapshot × 0.5 ─── SCORE DE CLAN ───────────────────────────────────────────────── score\_clan \+= 1 par visite valide d'un membre (cumulé sur la saison) ─── VISITE VALIDE (critères cumulatifs) ─────────────────────────── 1\. frameId \=== 0 (frame principal) 2\. schéma https ou http (pas chrome://, file://, etc.) 3\. dwell\_time \>= 12 000ms (focus actif) 4\. cooldown \>= 2 700 000ms depuis dernière visite valide sur ce domaine 5\. velocity \< 25 domaines uniques dans la fenêtre glissante de 60min 6\. flagged \= FALSE côté serveur ─── CYCLE DE VIE DU TERRITOIRE ──────────────────────────────────── découvert     → si première visite mondiale du domaine inactif       → si last\_visit\_at \> NOW() \- 48h supprimé      → si last\_visit\_at \> NOW() \- 72h |
| :---- |

*Net Kingdoms GDD v2.0 — Document de référence développeur — Confidentiel*