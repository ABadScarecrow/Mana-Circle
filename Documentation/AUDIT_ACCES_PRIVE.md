# Audit et décisions : accès privé

Audit du code local avant modification, le 13 octobre 2026. Le dépôt contenait déjà des modifications non committées : elles ont été conservées. Aucune commande n’a ouvert la base réelle `data/mana.sqlite` pendant cette intervention.

- Entrée : `src/server/index.ts`, Express puis fichiers `dist` en production, Vite middleware en développement. Écoute initiale sur toutes les interfaces. Fallback SPA sur toutes les pages, sans protection serveur.
- Frontend : `src/client/main.tsx`, navigation par état React, pas de routeur externe. `/api/me` décide de l’affichage connecté. L’inscription était un simple changement d’état accessible à tous.
- Auth : `src/server/app.ts`, POST register/login avant le middleware de session. Inscription publique. Zod valide le pseudo et la longueur du mot de passe. Bcrypt réellement utilisé, coût 12. Ancienne limite de 72 caractères insuffisante pour le plafond de 72 octets bcrypt.
- SQLite : `users.password` contient le hash ; `sessions.token` contient SHA-256 d’un token crypto aléatoire de 32 octets, expire après sept jours. Logout supprime le token ; reset supprime les autres sessions. Aucun renouvellement glissant.
- Sécurité effective : helmet utilisé, rate-limit utilisé pour register/login, en-tête personnalisé exigé pour écritures API, Origin exact s’il est fourni. Pas de CORS permissif. Cookie HttpOnly/SameSite Strict/Secure en production. Pas de configuration proxy explicite ; origine localhost par défaut même en production.
- Autorisations : middleware commun sur toutes les API métier ; listes personnelles filtrées par user_id ; accès decks vérifie le propriétaire ; amitiés acceptées nécessaires aux correspondances. Requêtes SQL paramétrées. Les données carte sont un catalogue commun. Pas de contrôle global d’admission distinct de l’authentification.
- JSON : plafond de 64 Mo conservé pour imports ; plafond métier de 10 Mo après parsing. Risque de charge par requêtes volumineuses, et appels externes longs pour utilisateurs autorisés. Pas de quota métier global.
- Erreurs : réponses internes génériques, détails de validation Zod ; suppression du logging de l’objet exception entier pour éviter d’exposer des données sensibles dans les logs.
- Scripts : tsx watch en dev, TypeScript strict + Vite build, Express via tsx au start ; tests Node/SQLite mémoire et Playwright avec API simulées.

## Modifications

Invitations individuelles de 256 bits, SHA-256 uniquement en base, expiration, usage unique transactionnel. Cookie d’invitation HttpOnly pour ouvrir `/register` ; l’API register accepte aussi un code valide explicite pour clients API et tests. Aucune branche ne permet une inscription sans invitation. Autorisation `site_access` obligatoire même pour une session existante. Les anciens comptes sont refusés par défaut, données conservées ; réautorisation locale explicite possible.

Toutes les pages passent par le contrôle serveur avant le serveur statique/Vite. Seuls `/login` et les ressources de code sans données sont publics. Le contenu React ne contient aucune donnée personnelle embarquée. Le formulaire de connexion est nécessairement public ; un visiteur extérieur peut voir ce formulaire, mais ne peut pas ouvrir l’inscription ni les pages privées ni lire les API métier.

Origine HTTPS obligatoire en production, confiance proxy limitée à loopback explicitement activée, écoute loopback obligatoire. Pas de dépendance externe d’identité. Pas de secret partagé. Révocation locale d’invitation (et du compte qui l’a consommée), de compte et de sessions. Une requête autorisée déjà en cours n’est pas annulée rétroactivement.

Les limites restantes sont documentées dans README : rate-limit en mémoire/par IP, confiance dans les processus locaux, disponibilité du PC et du réseau, Cloudflare termine TLS, URL et disponibilité temporaires, imports longs. Le tunnel réel et un accès mobile doivent encore être vérifiés par l’hébergeur ; les tests locaux ne prouvent pas la disponibilité du service Cloudflare.

## Contre-audit du dépôt après le commit f455bf0

Les observations d’une inscription publique et d’une écoute sur `0.0.0.0` ne correspondent pas à la version locale examinée : `app.ts` exige déjà une invitation, revalide celle-ci dans la transaction après le hash bcrypt et vérifie `site_access` à chaque requête protégée. `index.ts` lit déjà `HOST` et `DB_PATH` via la configuration. Le CLI révoque l’autorisation et supprime les sessions dans une transaction. Ces comportements sont maintenant également vérifiés via des processus réels, pas seulement `createApp` en mémoire.

Écarts corrigés : résolution des chemins SQLite dupliquée et dépendante du répertoire courant, création systématique de `data/` même pour une autre base, documentation n’expliquant pas le chargement de la configuration dans chaque terminal admin. `databasePath` et `openConfiguredDatabase` sont désormais communs aux deux exécutables ; les chemins relatifs de base et les ressources frontend sont ancrés dans le dépôt. Le parent du fichier configuré est créé ; vide et `:memory:` sont refusés.

Les exceptions publiques pour les chemins Vite sont désormais limitées au développement. Le frontend revient à `/login` après logout, et après un 401 lors du rafraîchissement ; revenir à la connexion depuis l’inscription charge réellement `/login`, au lieu de conserver une URL d’inscription dont l’invitation pourrait expirer.

La base réelle n’a pas été ouverte pendant ce contre-audit. Les tests d’intégration utilisent une base temporaire isolée et conservent un compte et sa collection pendant les autorisations/révocations. Le tunnel Cloudflare réel n’a pas été lancé ; un test depuis un autre réseau reste nécessaire sur le PC hébergeur.

Validation du contre-audit : `npm test` réussit (64 tests), `npm run build` réussit (TypeScript strict et Vite), `npm run test:browser` réussit (20 tests Chromium sur 320, 390, 768 et 1440 px). `git diff --check` ne signale aucun problème. Les tests navigateur vérifient aussi le retour réel de `/register` vers `/login` et le masquage des sections privées après un 401.
