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
