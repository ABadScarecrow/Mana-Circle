# Mana Circle

Un petit outil entre amis : decks, collection, wishlist et échanges. React + TypeScript, Express et SQLite, dans un seul dépôt. Pas de service de base de données à installer.

## Lancer le site

Avec Node.js 24.12 ou supérieur :

```bash
npm ci
npm run dev
```

Ouvrir **http://localhost:3000**, créer un compte et inviter ses amis par leur pseudo. Les données restent dans `data/mana.sqlite`. Les collections ne sont croisées qu’entre amis acceptés.

```bash
npm test
npm run build
NODE_ENV=production npm start
```

Le dernier lancement sert l’interface compilée et utilise des cookies sécurisés : HTTPS est nécessaire. `PORT` et `APP_ORIGIN` permettent de changer l’adresse si besoin ; sinon aucune configuration n’est requise. Les fichiers `.env` ne sont pas chargés automatiquement.

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

Un import partiel enregistre les lignes reconnues et laisse uniquement les erreurs à corriger dans le champ, avec leurs métadonnées et leur section. Une correction est ajoutée au même deck. Les imports additionnent les cartes à une collection ; les saisies individuelles remplacent sa quantité totale. Maximum 9999 exemplaires par ligne et par carte dans une collection/wishlist ; les decks peuvent conserver plus de 9999 exemplaires répartis sur plusieurs lignes.

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

Ne pas committer la base ou des secrets. Pour une sauvegarde simple, arrêter le serveur avant de copier la base et ses fichiers WAL. Un seul processus serveur suffit. Les images des cartes restent celles de Scryfall, indépendamment des couleurs de l’interface.

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
