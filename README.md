# Mana Circle

Un petit outil entre amis : decks, collection, wishlist et échanges. React + TypeScript, Express et SQLite, dans un seul dépôt. Pas de service de base de données à installer.

## Site privé et hébergement EndeavourOS

Prérequis : Node.js >=24.12, npm, Git et SQLite. Depuis le dépôt, ne jamais lancer le serveur avec sudo. Installer Cloudflare Tunnel depuis le dépôt Extra d’Arch ([paquet officiel](https://archlinux.org/packages/extra/x86_64/cloudflared/)) :

```bash
sudo pacman -Syu nodejs npm git sqlite cloudflared
node --version
npm ci
npm run build
```

Les comptes existants et leurs collections sont conservés. La migration ajoute seulement `invitations` et `site_access`, automatiquement à l’ouverture. **Les anciens comptes restent interdits jusqu’à autorisation explicite**. Avant la première ouverture sur disque, arrêter l’ancien serveur et sauvegarder :

```bash
mkdir -p backups
sqlite3 data/mana.sqlite ".backup 'backups/avant-acces-prive.sqlite'"
```

Si la base n’existe pas encore, sa création est automatique. Elle reste hors de `dist` et ne peut pas être téléchargée via HTTP. Ne jamais placer la base ni les sauvegardes dans les ressources publiques.

### Administrer les accès depuis le terminal

Le serveur et le CLI utilisent la même fonction d’ouverture : `DB_PATH` si défini, sinon `data/mana.sqlite`. Un chemin relatif est résolu depuis la racine du dépôt, indépendamment du répertoire de lancement ; un chemin absolu est conservé. Le répertoire parent est créé si nécessaire. Un `DB_PATH` vide ou `:memory:` est refusé. Il n’y a pas d’administration publique.

**Dans chaque terminal d’administration, charger la même configuration que le serveur avant toute commande** (créer et renseigner `.env` comme indiqué plus bas). Sans cela, un `DB_PATH` personnalisé exporté uniquement dans le terminal serveur ne serait pas transmis au CLI :

```bash
set -a
source .env
set +a
umask 077
```

Pour un essai local sans `.env`, les deux commandes utilisent la base par défaut.

```bash
npm run admin -- invite "Alice" 72
npm run admin -- list
npm run admin -- revoke-invite ID_A_REMPLACER
npm run admin -- revoke-user PSEUDO_A_REMPLACER
npm run admin -- allow-user PSEUDO_EXISTANT
```

`invite` affiche un ID et un code aléatoire de 256 bits : transmettre uniquement le code à son destinataire, par un canal privé. Sa durée est de 72 heures par défaut, maximum 720 heures. Seul son SHA-256 est conservé. L’ami ouvre `/login`, saisit son invitation, puis accède à `/register` grâce à un cookie HttpOnly. Le code est consommé dans la même transaction que la création du compte. Aucun compte tiers n’est requis. Aux visites suivantes, le pseudonyme et le mot de passe suffisent.

Révoquer une invitation déjà utilisée révoque aussi son compte et supprime ses sessions. `revoke-user` interdit immédiatement les prochaines requêtes, sans effacer les données. `allow-user` réautorise un compte existant ; les sessions supprimées ne sont pas restaurées. Une requête déjà en cours peut se terminer. Le libellé sert au suivi administratif et ne lie pas cryptographiquement le code à une identité : son porteur peut l’utiliser, donc ne pas le publier.

### Lancer le tunnel et la production

Dans un premier terminal, lancer le tunnel avant l’application pour obtenir son origine exacte :

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

Les premières requêtes peuvent échouer tant que l’application n’est pas lancée. Copier l’URL HTTPS imprimée dans `.env` (ne pas copier de chemin ni de slash final) :

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Configuration attendue :

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
APP_ORIGIN=https://votre-adresse.trycloudflare.com
TRUST_PROXY=loopback
DB_PATH=data/mana.sqlite
```

Dans un second terminal, depuis le dépôt :

```bash
set -a
source .env
set +a
umask 077
npm start
```

Le fichier fourni ne contient que des affectations shell simples ; ne sourcer que votre propre configuration. Les fichiers `.env` ne sont pas chargés automatiquement. `npm start` exécute Express via tsx et sert le frontend compilé dans `dist`. Aucun serveur Vite n’est utilisé en production. En cas de changement de port, adapter aussi `--url`. `HOST` est limité à la boucle locale. Le proxy n’est accepté que depuis la boucle locale ; ne pas ajouter de proxy intermédiaire sans revoir la chaîne de confiance. Les autres programmes locaux sont donc dans le périmètre de confiance. Le HTTP entre cloudflared et Express reste exclusivement local ; les navigateurs utilisent HTTPS et des cookies Secure.

Arrêter chaque processus avec Ctrl+C dans son terminal. Le PC, l’application, le tunnel et la connexion Internet doivent rester actifs ; désactiver la mise en veille si nécessaire. Aucun port entrant à ouvrir sur la box. Après un redémarrage du tunnel, mettre à jour `APP_ORIGIN` et redémarrer Express, puis retransmettre la nouvelle URL. Ne jamais remplacer l’origine par un joker pour éviter cette étape.

Les [Quick Tunnels officiels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) sont gratuits, sans compte ni domaine, destinés aux essais : adresse temporaire, aucune garantie de disponibilité, maximum 200 requêtes simultanées, pas de SSE. L’import actuel utilise NDJSON, pas SSE ; vérifier néanmoins un import réel à travers le tunnel, car le réseau et les délais du proxy peuvent interrompre un gros import. Une adresse stable nécessite une autre configuration, typiquement un tunnel nommé et un domaine. Cloudflare termine TLS et voit le trafic ; cette solution n’est pas un chiffrement de bout en bout indépendant de Cloudflare.

### Vérifier depuis un autre réseau

Sur un téléphone en données mobiles, ouvrir la nouvelle URL dans une fenêtre privée. `/` mène à la connexion ; `/register`, `/collection` et toute autre page privée doivent être refusées sans autorisation. `/api/collection` doit renvoyer 401. Sans invitation, aucun compte ne peut être créé. Donner un code à un ami, vérifier son inscription puis sa reconnexion, et vérifier que le même code ne permet pas une deuxième inscription. Révoquer son compte, puis vérifier que son navigateur connecté ne peut plus obtenir les données. Seuls la connexion et les fichiers compilés sous `/assets/`, sans données personnelles, sont publics en production. Les chemins de développement `/src/`, `/@…` et `/node_modules/` exigent une session autorisée en production. Le frontend revient à la connexion lorsqu’un rafraîchissement reçoit 401, notamment après expiration ou révocation ; le serveur bloque les requêtes dès la révocation.

### Sauvegarder, restaurer et mettre à jour

Le mécanisme de sauvegarde SQLite inclut les transactions validées du WAL ; ne pas simplement copier un fichier SQLite pendant une écriture :

```bash
mkdir -p backups
npm run admin -- backup backups/mana-sauvegarde.sqlite
sqlite3 backups/mana-sauvegarde.sqlite 'PRAGMA integrity_check;'
```

Conserver plusieurs sauvegardes datées, avec permissions privées, idéalement sur un autre support. Elles contiennent les comptes, hashes et données personnelles. Pour restaurer, arrêter **tous** les processus utilisant la base (serveur et commandes admin), puis garder l’ensemble actuel avant remplacement :

```bash
mkdir -p backups/avant-restauration
mv data/mana.sqlite backups/avant-restauration/
# Déplacer aussi les fichiers WAL/SHM s’ils existent, serveur arrêté :
[ ! -f data/mana.sqlite-wal ] || mv data/mana.sqlite-wal backups/avant-restauration/
[ ! -f data/mana.sqlite-shm ] || mv data/mana.sqlite-shm backups/avant-restauration/
cp backups/mana-sauvegarde.sqlite data/mana.sqlite
chmod 600 data/mana.sqlite
sqlite3 data/mana.sqlite 'PRAGMA integrity_check; DELETE FROM sessions;'
```

Utiliser un répertoire de conservation neuf à chaque restauration. Adapter les chemins si `DB_PATH` diffère. Une restauration revient également à l’état antérieur des autorisations et invitations : revoir `npm run admin -- list`, révoquer les codes/comptes nécessaires avant de relancer. Les sessions sont supprimées dans la procédure ci-dessus.

Pour mettre à jour : sauvegarder, arrêter le serveur, intégrer les changements Git sans écraser vos modifications locales, puis `npm ci`, `npm test`, `npm run build` et relancer. Mettre EndeavourOS et cloudflared à jour régulièrement. `.env`, bases et sauvegardes sont ignorés par Git.

### Protections et limites

Bcrypt coût 12, pseudonymes 3–30 caractères ASCII, mots de passe 12 caractères minimum et 72 **octets UTF-8** maximum. Sessions de sept jours, jetons aléatoires de 256 bits hashés en base, révocation au logout. Cookies HttpOnly, SameSite Strict et Secure en production. Chaque API vérifie session et autorisation, puis propriété des données ou amitié acceptée. Les écritures exigent `X-Mana-Request: 1` ; toute origine fournie doit correspondre exactement à `APP_ORIGIN`. Aucun CORS permissif n’est activé. Un client non navigateur peut omettre Origin, mais doit toujours fournir une invitation ou une session autorisée.

Connexion, inscription et validation d’invitation partagent une limite de 25 requêtes par IP sur 15 minutes. Elle est en mémoire, se réinitialise au redémarrage et peut affecter plusieurs amis derrière une même IP. Les requêtes métier n’ont pas de quota global ; les imports autorisés restent coûteux. Un attaquant réparti sur plusieurs IP peut toujours provoquer une charge : ce petit serveur n’a pas vocation à résister à un déni de service massif. Le parseur JSON accepte jusqu’à 64 Mo pour conserver les imports existants, puis la limite métier de 10 Mo est contrôlée. Garder la machine et les comptes locaux sûrs.

Le démarrage de production refuse une origine absente, HTTP, avec chemin, un proxy non explicitement configuré ou une écoute hors boucle locale. Le mode développement (`npm run dev`, puis invitation via admin) est pour les essais locaux uniquement et utilise des cookies sans Secure. Ne jamais publier le serveur de développement.

## Rechercher dans ses listes

Une petite barre de recherche reste visible dans **Decks**, **Collection** et **Wishlist**. Elle filtre immédiatement les decks par leur nom, ou les cartes par leur nom français/anglais, sans ouvrir un outil. Dans un deck ouvert, **Rechercher dans ce deck** filtre ses cartes avant pagination. Vider la recherche réaffiche la liste. Les recherches ignorent la casse et les accents.

## Recherche avancée dans les listes

**Recherche avancée** utilise le même formulaire et les mêmes critères Scryfall dans Recherche, Collection, Wishlist, Échanges, les decks et les bibliothèques d’amis. Dans les listes, seuls les identifiants Oracle déjà présents sont conservés ; dans une liste de decks, un deck reste visible s’il contient une carte correspondant aux critères. Le filtrage des cartes paginées se fait avant pagination. **Tout effacer** restaure la liste. Les champs donnent des exemples de format (comparaison numérique, coût de mana, date ISO, UUID, etc.).

Les critères d’extension, de date, de langue et de prix EUR concernent une version disponible dans le catalogue Scryfall, même si la collection est regroupée par Oracle ID. Ils ne signifient pas que cette impression précise est possédée. Les filtres d’édition enregistrée des decks et les filtres de valeur AVG Cardmarket restent distincts. Les résultats dépendent de Scryfall ; une erreur de réseau est affichée. Le serveur limite la recherche aux cartes concernées et réutilise les mêmes résultats pendant une minute pour les rafraîchissements.

## Consulter les listes des amis

Dans **Amis**, accepter la demande d’amitié puis cliquer sur **Voir les listes**. Les cartes d’Échanges et des bibliothèques d’amis réutilisent l’affichage des collections (vues Cartes/Liste, taille, aperçus, prix et détails). Les listes des amis restent en lecture seule. La bibliothèque affiche la **collection**, la **wishlist** et les **decks** de cet ami. La liste des decks dispose aussi d’une recherche par nom. Choisir **Consulter le deck** pour voir ses cartes, sections, quantités et éditions. La recherche accepte les noms anglais et les traductions françaises déjà mises en cache ; les cartes sont affichées avec leurs traductions disponibles. Les listes de cartes sont paginées par 100 éléments.

La consultation est réciproque dès que l’amitié est acceptée et reste en lecture seule : aucun ajout, retrait, import ou changement de deck de l’ami. Supprimer l’amitié ferme l’accès aux prochaines requêtes. Le compte consulté doit encore être autorisé sur le site ; une demande en attente ou un simple identifiant connu ne donne aucun accès. La vue ouverte se rafraîchit toutes les cinq secondes et masque les données en cas de refus. Des informations déjà reçues ne peuvent pas être retirées du navigateur d’un destinataire.

Les API de lecture, sous `/api`, sont :

- `GET /friends/:userId/collection?offset=0&name=…`
- `GET /friends/:userId/wishlist?offset=0&name=…`
- `GET /friends/:userId/decks?name=…`
- `GET /friends/:userId/decks/:deckId/cards?offset=0&name=…`

Chaque requête exige une session autorisée et une amitié acceptée. Le deck doit appartenir à l’ami indiqué. Les réponses ne contiennent ni mot de passe ni session. Ces routes ne permettent aucune écriture. Les objectifs, imports, exports et changements de ses propres listes restent disponibles dans leurs sections habituelles.

## Importer et exporter ses decks

Dans **Decks**, coller une liste ou choisir un fichier texte UTF-8 ou CSV ManaBox. La limite est **10 Mo = 10 485 760 octets**, contrôlée dans le navigateur et sur le serveur, y compris pour du texte collé. Les cartes sont validées par Scryfall et mises en cache localement.

Formats acceptés :

```text
Commander
1 Zedruu the Greathearted

Deck
2x Arcane Signet
1 Counterspell (DMR) 49
1 Sol Ring (CMM) 396 *F
1 Wear // Tear
Lightning Bolt

Sideboard
2 Negate

Maybeboard
1 Propaganda
```

Les quantités avec ou sans `x`, les noms seuls (quantité 1), les éditions `(SET)` / `[SET]`, les numéros de collection, le foil `*F` / `*F*` et les noms avec `//` sont conservés. Les sections Mainboard/Main sont aussi acceptées comme alias de Deck, ainsi que le préfixe `SB:`. Les lignes vides et les commentaires `#` / `//` sont ignorés. Les fichiers XML ne sont pas pris en charge.

Chaque ligne de deck est conservée séparément : deux Sol Ring de différentes éditions ne fusionnent pas. **Exporter .txt** télécharge les lignes dans leur ordre, en conservant leur écriture (`x`, édition, numéro, foil). Les titres de section sont normalisés en Commander, Deck, Sideboard et Maybeboard, avec une ligne vide entre sections.

Un import partiel enregistre les lignes reconnues et laisse uniquement les erreurs à corriger dans le champ, avec leurs métadonnées et leur section. Une correction est ajoutée au même deck. Dans **Collection** et **Wishlist**, le bouton **Importer** accepte aussi les listes collées et les fichiers texte/CSV ManaBox, avec progression et correction des erreurs. Les imports additionnent les cartes à la liste choisie ; les saisies individuelles remplacent sa quantité totale. Maximum 9999 exemplaires par ligne et par carte dans une collection/wishlist ; les decks peuvent conserver plus de 9999 exemplaires répartis sur plusieurs lignes.

Les cartes du **Maybeboard** sont exportées mais exclues du calcul des cartes manquantes. Pour les autres sections, on additionne les quantités puis on soustrait la collection. Ajouter les manquantes à la wishlist conserve le maximum avec les besoins existants, avec une limite de 9999 exemplaires par carte et ne réserve aucune carte.

## Noms français et anglais

La recherche accepte les noms français et anglais, par exemple **Foudre** ou **Lightning Bolt**. Les suggestions, collections, wishlists, decks, échanges et aperçus affichent le nom français quand Scryfall fournit une traduction. Le volet de droite indique aussi explicitement le **nom anglais**.

La sélection d’une suggestion conserve le nom anglais canonique dans le formulaire ; l’identité reste l’Oracle ID. Le classement et les filtres ignorent la casse et les accents. Les anciennes collections sont traduites progressivement en arrière-plan, avec au maximum 100 cartes en cours de traduction ; les pages de deck chargent seulement les traductions des lignes visibles. Le cache de traductions dure sept jours. Si aucune version française n’est disponible ou si l’API est momentanément inaccessible, le nom anglais reste affiché.

L’affichage français ne réécrit pas les exports : les lignes, noms, éditions, numéros et marqueurs foil importés restent inchangés. L’historique de chaque demande de cette conversation figure dans [Documentation/HISTORIQUE_FEATURES.MD](Documentation/HISTORIQUE_FEATURES.MD).

## Gros imports et progression

Les imports prennent en charge **30 000 lignes**, dans la limite de fichier de 10 Mo. Les noms sont dédupliqués, le cache SQLite est consulté puis Scryfall est interrogé par lots de 75 noms. Les écritures sont préparées une fois et exécutées dans une seule transaction : pas de recalcul SQL du total à chaque ligne.

L’interface reçoit la progression en streaming : lecture, validation des noms, puis enregistrement. Une liste avec de nombreux noms jamais vus dépend encore du réseau et des limites Scryfall ; les doublons et les noms en cache ne déclenchent pas de requêtes supplémentaires. Les lignes du deck restent séparées pour l’export. L’affichage charge seulement 100 lignes par page, à l’ouverture du deck, et le rafraîchissement utilise des résumés légers.

Le test de 30 000 lignes (150 noms distincts, API simulée) vérifie deux requêtes de lots, une progression, un export identique et la pagination. Le temps affiché par ce test mesure le traitement local avec API simulée, pas le délai d’un import réel.

## Versions et prix

Survoler, cliquer ou sélectionner une carte au clavier ouvre le panneau de droite. Il affiche le texte de la carte, les éditions Scryfall, les extensions, les numéros, les dates de sortie et les liens Cardmarket. Les versions sont mises en cache une heure ; le [guide officiel Cardmarket](https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_1.json) est chargé une fois par jour et partagé entre les cartes. La case « Prix foil » sélectionne les données foil.

- **Bas** : minimum des prix bas Cardmarket des versions disponibles.
- **Moyen** : moyenne des prix moyens des versions ; repère EUR Scryfall si le guide ne fournit pas de moyenne.
- **Haut · versions** : maximum des prix moyens des versions, pour voir la version la plus chère. Ce n’est **pas** le maximum des annonces.

Le guide public Cardmarket ne fournit pas de prix haut par produit : ces valeurs restent non renseignées dans chaque version. Aucune fourchette fictive n’est calculée. Les prix sont indicatifs, datés, en EUR, avec leur source ; les éditions rares peuvent tirer le repère haut vers le haut. L’état/langue des annonces ne sont pas filtrés. Si une source est indisponible, le panneau l’indique et utilise les données disponibles. Les prix ne sont jamais chargés pendant l’import.

## Listes, filtres et taille

Les boutons **Liste / Cartes** changent la présentation sans modifier les données. La collection et la wishlist affichent les cartes distinctes et les exemplaires, avant/après filtres. Les decks affichent aussi leur nombre de lignes ; leur filtre s’applique à tout le deck avant la pagination. Un objectif facultatif de taille peut être enregistré pour la collection et chaque deck. Cet objectif compte les exemplaires de toutes les sections, Maybeboard inclus, sans vérifier les règles d’un format.

Dans Recherche, les filtres avancés couvrent les propriétés principales des cartes. Le champ **Expression Scryfall libre** donne accès à [tous les opérateurs Scryfall](https://scryfall.com/docs/syntax), comparaisons, ET/OU et exclusions. Les filtres de listes portent uniquement sur les informations enregistrées. La collection étant regroupée par Oracle ID, les éditions, langues physiques, conditions et finitions de ses exemplaires ne sont pas connues ; ces filtres de versions s’utilisent dans le catalogue ou les lignes de decks.

## Valeur d’inventaire et échanges

Cliquer sur **Calculer la valeur** dans la collection, wishlist ou un deck. Le calcul utilise uniquement les **prix moyens Cardmarket AVG** multipliés par les quantités, avec des données foil distinctes. Si l’édition et le numéro sont enregistrés, on utilise cette version précise ; sinon une impression de référence et l’indication « estimation ». La collection/wishlist n’enregistrant pas de versions physiques, leur montant est indicatif, par défaut non foil.

Le montant présenté est la somme des exemplaires cotés ; les exemplaires sans prix restent non cotés et le total est marqué partiel. Les repères EUR Scryfall ne sont pas mélangés à ce total. Le détail indique prix unitaire, quantité et valeur par ligne, ainsi que la date du guide. Le premier calcul peut prendre du temps si de nombreuses éditions doivent être résolues ; les suivants réutilisent les caches. Ce calcul ne ralentit pas l’import.

Dans Échanges, le même bouton affiche pour chaque correspondance : prix unitaire, valeur recherchée (`quantité voulue × prix`), valeur possédée et valeur échangeable (`minimum des deux quantités × prix`). Les éditions n’étant pas connues dans les collections, ces valeurs sont des estimations à confirmer entre amis. Plusieurs amis proposant la même carte sont des alternatives : leurs opportunités ne sont pas cumulées en un inventaire réel.

## Remettre son compte à zéro

Dans **Compte**, saisir son mot de passe et **RESET**, puis utiliser le bouton d’effacement. L’action est définitive : elle retire decks, collection, wishlist, objectifs et amitiés, en conservant le pseudo/mot de passe et la session courante. Les autres sessions sont révoquées. Les autres comptes ne sont pas vidés. Les imports commencés avant le reset sont annulés avant écriture.

## Code et tests

- `src/client/` : interface, recherche et styles noir/gris avec touches violettes et pêche.
- `src/server/parser.ts` : parseur et exporteur.
- `src/server/schema.sql`, `db.ts` : stockage et migration automatique des anciens decks.
- `src/server/app.ts` : routes et accès privés ; `scryfall.ts` : validation et recherche de cartes.
- `tests/fixtures/mixed-decklist.txt` : liste complète fournie, utilisée dans les tests d’aller-retour.

Les tests vérifient l’import, l’export puis le réimport de cette liste exacte, y compris après fermeture/réouverture de SQLite, les anciennes données, les imports partiels et les limites de taille en UTF-8. Ils couvrent aussi Levenshtein et les croisements entre amis. Scryfall est simulé pour rendre les tests indépendants du réseau.

Les anciennes données sont migrées sans supprimer de cartes. Les éditions et le foil que l’ancien stockage avait déjà perdus ne peuvent pas être reconstitués : leur export utilise une ligne simple `quantité nom`.

## Routes utiles

Toutes les routes commencent par `/api` et nécessitent une session, sauf la connexion/inscription. Les mutations JSON utilisent `X-Mana-Request: 1`.

| Route | Usage |
| --- | --- |
| `POST /auth/register`, `/auth/login`, `/auth/logout` | Comptes et sessions |
| `GET /me` | Compte connecté |
| `POST /account/reset` | `{password, confirmation: "RESET"}` |
| `GET /settings`, `PATCH /settings` | Lire / écrire `{collection_target: nombre ou null}` |
| `PATCH /decks/:id/settings` | `{target_size: nombre ou null}` |
| `GET /cards/filter?q=…&page=1` | Catalogue avancé et pagination |
| `POST /valuation` | `{target: "collection" / "wishlist" / "deck" / "matches", deckId?}` |
| `GET /cards/search?q=…` | Suggestions classées par Levenshtein, avec images |
| `GET /decks` | Ses decks et leurs lignes ; `?summary=1` renvoie les résumés uniquement |
| `GET /decks/:id/cards?offset=0` | 100 lignes du deck, accès réservé au propriétaire |
| `GET /cards/:oracleId/details?foil=0` | Versions, dates et prix, session requise |
| `POST /decks/import` | `{name, text, format?}` ou `{deckId, text, format?}` |
| `GET /decks/:id/export` | Télécharger une decklist texte |
| `POST /decks/:id/missing` | Ajouter les manquantes à la wishlist |
| `DELETE /decks/:id` | Supprimer un deck |
| `GET /collection`, `/wishlist` | Ses cartes |
| `PUT /collection`, `/wishlist` | `{name, quantity}` |
| `POST /collection/import` | `{text, format?}` |
| `DELETE /collection/:oracleId`, `/wishlist/:oracleId` | Retirer une carte |
| `GET /friends`, `POST /friends` | Relations / inviter avec `{username}` |
| `PATCH /friends/:id` | Accepter avec `{action: "accept"}` |
| `DELETE /friends/:id` | Annuler, refuser ou supprimer |
| `GET /matches` | Croisements dans les deux sens |

Ne pas committer la base ou des secrets. Utiliser la procédure de sauvegarde cohérente décrite plus haut. Un seul processus serveur suffit. Les images des cartes restent celles de Scryfall, indépendamment des couleurs de l’interface.

## Outils compacts, tailles et CSV ManaBox

Les boutons près des listes ouvrent les outils d’ajout, import, filtres, objectif et valeur dans des fenêtres accessibles au clavier (Échap pour fermer). Le tri A–Z/Z–A/quantité reste dans la barre compacte. Le slider adapte la largeur des cartes (100–340 px) ou la densité des lignes (28–90 px) ; les réglages sont séparés pour les deux vues, sans changer la pagination.

Le CSV accepte virgules ou points-virgules, guillemets, virgules dans les noms, lignes CRLF et BOM UTF-8. Colonnes ManaBox : `Name`, `Quantity`, `Set code`, `Collector number`, `Foil` (`normal`, `foil`, `etched`), `Scryfall ID`, `Language`, `Condition`. `Section` ou `Board` est facultatif ; sans section, les cartes vont dans Deck. L’identifiant Scryfall résout l’impression exacte ; à défaut, extension et numéro, puis nom. Les lignes invalides restent dans un CSV correct avec son en-tête pour correction.

Les éditions, numéros, finitions, langues et états sont conservés en base, y compris dans la collection ; les correspondances entre amis restent regroupées par Oracle ID. La saisie individuelle d’une quantité totale remplace le détail des versions de cette carte. Les colonnes propres aux classeurs, achats ou notes ManaBox ne sont pas importées. La valorisation utilise les éditions connues, mais pas un tarif spécifique à l’état/langue ; etched reste non coté faute de correspondance fiable dans le guide.

Deux exports de deck sont disponibles : `.txt` pour les sections, quantités, éditions, numéros et finitions (`*E` pour etched), `.csv` pour conserver aussi identifiants, langues et états. Le CSV exporté peut être réimporté. Les noms affichés sont français quand Scryfall propose une traduction, avec repli anglais sinon ; les noms canoniques d’export restent anglais.

## Sélection et prix dans les cadres

Cliquer une carte (ou Entrée/Espace quand son aperçu est focalisé) ouvre ses détails à droite. Le survol garde uniquement l’aperçu agrandi : il ne change plus la sélection du volet. Un dropdown sous l’image choisit l’édition, avec extension, numéro, date et prix. Le choix est conservé quand on passe aux prix foil.

Chaque carte visible présente automatiquement son prix unitaire moyen Cardmarket AVG, dans les decks, collections, wishlists, échanges et résultats/suggestions. Les requêtes sont dédupliquées et regroupées par lots de 100 via `POST /api/cards/prices`, avec le cache des impressions et du guide existants. L’édition/numéro/finition sont utilisés quand connus ; `≈` indique une édition de référence. Les tarifs inconnus restent « Non coté » ou « Prix indisponible », sans inventer de valeur ; etched reste non coté. La mise à jour des prix ne touche pas à l’import/export.

L’ajout individuel attend désormais la résolution du nom français. Dans les listes, les traductions encore en chargement affichent un statut au lieu d’un nom anglais provisoire ; une panne du chargement côté navigateur est réessayée. Si Scryfall ne propose aucune traduction, le nom canonique anglais reste le repli.

## Total automatique et estimation des prix

Le bouton « Valeur » a été remplacé par un total automatique, indépendant du filtrage et de la pagination. Collection, wishlist et decks indiquent valeur, exemplaires non cotés et exemplaires estimés ; les échanges sont aussi valorisés automatiquement. Actualisation après modification et toutes les dix minutes. Le premier calcul peut prendre du temps lorsque les catalogues de prix ne sont pas encore en cache.

Pour les collections/wishlists/échanges, choisir **Trier → Prix ↑ / Prix ↓** et **Filtres → Prix unitaire min./max. (€)** ou **Avec/Sans un prix**. Les decks proposent les mêmes filtres et un tri par prix avant pagination. Un prix absent reste en dernier dans les deux sens et ne devient jamais zéro. Dans une collection regroupant plusieurs versions d’une carte, le cadre utilise le prix moyen pondéré des exemplaires cotés ; le total utilise chaque ligne d’édition et sa quantité. `≈` indique une estimation ou une cotation partielle de ces exemplaires. La recherche globale conserve ses critères EUR Scryfall, qui peuvent différer des estimations d’inventaire.

Ordre de priorité : guide **Cardmarket AVG**, prix EUR Cardmarket relayé par **Scryfall**, puis **médiane de prix américains convertis en EUR** : TCGplayer via Scryfall, ManaPool NM et CardKingdom vente NM en stock. Les impressions sont comparées par ID Scryfall et finition ; prix d’achat buylist et prix d’une autre édition/finition sont exclus. Etched peut désormais être estimé si une source compatible existe. Les langues/états ne sont pas tarifés individuellement ; montants indicatifs hors port et taxes. Les sources, dates et le taux de change apparaissent dans le volet droit ; les estimations sont marquées `≈`. Sans cotation ou sans taux USD/EUR valide, le prix reste absent et le total est partiel.

Les catalogues [ManaPool](https://manapool.com/api/docs/v1/openapi.json) et [CardKingdom](https://api.cardkingdom.com/api/v2/pricelist), ainsi que le taux [Frankfurter](https://frankfurter.dev/), sont publics et mis en cache 24 h, avec requêtes simultanées mutualisées. Aucun compte fournisseur ni nouvelle configuration n’est nécessaire. Les anciennes données de repli restent utilisables au plus sept jours, avec indication de leur ancienneté. Les échecs sont réessayés après une minute. [TCGplayer n’accorde actuellement plus de nouveaux accès API](https://docs.tcgplayer.com/docs/getting-started) : ses données sont obtenues via Scryfall, sans prétendre à un accès direct.

Cette section remplace les règles précédentes qui excluaient les repères de repli des totaux et laissaient systématiquement etched non coté.


## Validation automatisée

```bash
npm test
npx playwright install chromium
npm run test:browser
npm run build
# ou toutes les vérifications :
npm run check
```

Pour un Chrome déjà installé : `CHROME_PATH=/chemin/vers/chrome npm run test:browser`. Les tests navigateur lancent leur propre serveur Vite sur `127.0.0.1:4175` ; ce port doit être libre. Ils vérifient les sept sections, les noms longs, les listes compactes, les fenêtres modales, la connexion/inscription, l’import partiel de wishlist et les noms français après une recherche, sur des largeurs de **320, 390, 768 et 1440 px**. Les API sont simulées dans ces tests pour rendre les résultats indépendants de Scryfall et de Cardmarket. Les tests API utilisent SQLite en mémoire et vérifient les écritures réelles, les protections CSRF, les reprises d’import et l’annulation après une remise à zéro du compte. Aucun compte réel n’est modifié. `tests/runtime-access.test.ts` lance aussi le vrai point d’entrée Express en production et le vrai CLI, depuis des répertoires différents, sur une base temporaire : il vérifie `DB_PATH`, l’inscription par invitation, la révocation, la suppression des sessions et la conservation d’une collection existante. Ces tests de sécurité n’exigent pas un build préalable ; les tests navigateur existants utilisent Vite et des API simulées, et ne valident pas à eux seuls la sécurité du serveur.

Les traces des tests navigateur en échec sont conservées dans `test-results/`. Le build refuse les variables, paramètres et imports TypeScript inutilisés.
