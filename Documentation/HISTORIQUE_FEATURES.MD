# Historique des fonctionnalités par demande

Ce document reprend les demandes de cette conversation et les fonctionnalités effectivement livrées. Il distingue les choix de fonctionnement et les limites des sources externes.

## 1. Guide du dépôt

- Création de `AGENTS.md` après vérification de son absence.
- Guide de contribution : organisation, conventions, tests, commits et configuration privée.

## 2. Application complète de collection et d’échange entre amis

- Stack React / TypeScript, Express et SQLite dans un seul dépôt.
- Comptes, mots de passe hachés, sessions HttpOnly, protection des mutations et accès privés.
- Collection distincte des decks, wishlist avec quantités, imports texte/fichier validés via Scryfall.
- Demandes d’amitié, acceptation/refus, suppression et croisements dans les deux sens entre amis acceptés.
- Identité des cartes par Oracle ID, actualisation des données et tests du parseur, des croisements et de l’API.
- README avec installation, lancement et routes.

## 3. Thème sombre, navigation, imports partiels et recherche

- Couleurs centralisées, thème sombre, états hover/focus et suppression des slogans.
- Section Recherche, repère de section active et liens vers la liste des decks.
- Import dans les decks et collections : quantités facultatives, doublons, erreurs explicites, conservation des lignes réussies et correction dans le même deck.
- Distance de Levenshtein implémentée, suggestions avec debounce, cache et navigation au clavier.
- Images paresseuses avec repli et aperçus agrandis au survol/focus, bornés à l’écran.

## 4. Simplification et fiabilité de l’import/export

- Suppression du tableau de bord, de styles morts, de paramètres inutilisés, de `DATABASE_PATH` et de la dépendance `cookie-parser`.
- Interface noir/gris, accents violet/pêche, textes plus décontractés et éléments arrondis ; aucune couleur verte définie dans l’interface.
- Limite de fichier et de texte à 1 Mo (1 048 576 octets), contrôlée dans le navigateur et sur le serveur.
- Export `.txt` et stockage séparé de chaque ligne de deck : quantités avec/sans `x`, éditions, numéros, foil `*F`/`*F*`, noms avec `//`, Commander, Deck, Sideboard et Maybeboard.
- Migration des anciennes données ; test d’import → export → réimport avec la liste exacte fournie, y compris après réouverture de SQLite.
- Maybeboard exclu du calcul des cartes manquantes. Les métadonnées déjà perdues par l’ancien stockage ne sont pas reconstituables.

## 5. Gros imports, progression, prix et panneau de carte

- Déduplication des noms, cache SQLite, lots Scryfall de 75 noms et écritures préparées dans une transaction.
- Progression en streaming : lecture, validation et enregistrement ; tests sur 6 000 et 30 000 lignes.
- Résumés de decks et pagination de 100 lignes pour éviter de charger/rendre tout le deck à chaque actualisation.
- Éléments du front légèrement agrandis.
- Panneau à droite au survol, clic ou sélection au clavier : texte, versions, extensions, numéros, dates, foil et liens Cardmarket.
- Guide officiel Cardmarket mis en cache : prix bas/moyens, repère Scryfall si nécessaire. « Haut · versions » désigne le maximum des prix moyens des versions ; le guide ne fournit pas le maximum des annonces.
- Limite de 1 Mo maintenue ; délai réseau variable selon le nombre de noms absents du cache.

## 6. Première demande de recherche en français

- Exploration des appels Scryfall et de la recherche existante.
- Cette demande a été interrompue puis complétée par la demande suivante ; aucune fonctionnalité distincte n’a été livrée à cette étape.

## 7. Recherche et affichage en français, nom anglais et documentation

- Recherche des noms français Scryfall en plus des noms anglais, avec suggestions classées par proximité dans les deux langues.
- Normalisation de la casse et des accents pour les filtres et le classement ; suggestions dédupliquées par Oracle ID.
- Noms français affichés dans la recherche, les decks, collections, wishlists, échanges et aperçus lorsqu’une traduction est disponible.
- Nom anglais explicitement affiché dans le panneau de droite. Les formulaires transmettent le nom canonique anglais après sélection d’une suggestion.
- Traductions et alias stockés en SQLite, avec cache de sept jours. Les anciennes listes sont enrichies progressivement sans ralentir les imports ; les pages de deck et le panneau attendent les traductions de leurs cartes visibles.
- Repli sur l’anglais si la carte n’a pas de traduction française dans Scryfall ou si la source est temporairement indisponible.
- Oracle ID, éditions, foil et lignes originales d’export conservés : l’affichage en français ne réécrit pas les decklists exportées.
- Tests de recherche française, cache, noms composés, accès aux différentes listes et conservation de l’export.
- Création de `Documentation/HISTORIQUE_FEATURES.MD`, ce récapitulatif par demande.

## 8. Reset du compte, filtres, tailles, vues et valeurs d’inventaire

- Section Compte et bouton de remise à zéro, avec vérification du mot de passe et confirmation `RESET`. Effacement des decks, collection, wishlist, objectifs et amitiés du compte connecté ; identifiants conservés, autres sessions révoquées. Les données des autres comptes et le cache public des cartes restent intacts.
- Annulation d’un import encore en cours si un reset intervient avant son enregistrement ; les ajouts simples en cours sont aussi annulés. Les calculs de valeur commencés avant le reset ne renvoient pas un inventaire périmé, et l’interface invalide un calcul si la liste change pendant son chargement.
- Recherche avancée avec nom, type/sous-type, texte, couleurs/identité, coût et valeur de mana, force/endurance/loyauté/défense, rareté, extension, numéro, illustrateur, mots-clés, format, disposition, support, cadre/bordure, langues, finitions, dates et repères de prix EUR. Expression libre pour tous les autres critères et combinaisons de la syntaxe Scryfall.
- Filtres de listes sur les données enregistrées : nom FR/EN, type, extension, section, foil, quantités et Oracle ID. Filtrage des decks avant pagination, y compris les lignes au-delà de la première page. Les collections restent identifiées par Oracle : leur édition, numéro, langue physique, état et foil ne sont pas enregistrés.
- Compteurs de lignes, cartes distinctes et exemplaires ; compteurs après filtrage pour les collections/wishlists. Objectif facultatif de taille pour la collection et chaque deck, sauvegardé en SQLite. Il porte sur les exemplaires de la liste et n’est pas une validation des règles d’un format.
- Boutons Liste/Cartes pour les collections, wishlists, échanges, résultats de recherche et contenu des decks ; pagination conservée pour les grandes listes.
- Bouton de calcul de valeur pour collection, wishlist et decks : prix moyens Cardmarket AVG × quantité. Édition et numéro utilisés quand connus, données foil distinctes, choix d’une version de référence sinon. Totaux en EUR avec date du guide, quantité cotée/non cotée et quantité estimée ; détail des 100 premières lignes consultable. Les données absentes restent « Non coté », sans faux prix à zéro.
- Valeurs des correspondances entre amis : prix unitaire, valeur recherchée, possédée et échangeable (`min(recherché, disponible) × prix`). Calcul limité aux amitiés acceptées et réévaluation des droits avant de renvoyer les résultats. Les opportunités alternatives chez plusieurs amis ne sont pas additionnées comme un échange unique.
- Valorisation séparée de l’import ; résolution des éditions manquantes par lots de 75 et réutilisation du cache des impressions et du guide Cardmarket. Les repères Scryfall ne sont pas comptés dans les totaux AVG Cardmarket.
- Tests des filtres, objectifs, reset isolé et imports concurrents, éditions/foil, quantités, cotations absentes, confidentialité et valeurs échangées ; anciennes garanties d’import/export maintenues.

## 9. Français dans toutes les listes, outils compacts, CSV ManaBox et slider

- Traduction des collections/wishlists/échanges attendue avant la réponse initiale ; cache partagé des noms français dans toutes les listes, images et aperçus, avec enrichissement par lots des cartes visibles. Nom anglais conservé dans le volet de droite et repli anglais si aucune traduction n’est disponible.
- Ajout, import, filtres, objectifs et calculs de valeur ouverts depuis des boutons près des listes, dans des fenêtres natives accessibles au clavier. Tri compact par nom ou quantité ; formulaires et résultats d’import conservés quand la fenêtre est fermée.
- Slider distinct par vue pour ajuster largeur des cards et densité des lignes, également dans chaque deck ; pagination maintenue pour les grandes listes.
- Favicon SVG original évoquant une pile de cartes Magic, dans la palette sombre/violette sans vert.
- Import texte et CSV ManaBox limité à 10 Mo (10 485 760 octets), côté client et serveur : cette limite remplace celle de 1 Mo des demandes précédentes.
- CSV UTF-8 avec BOM, virgules/points-virgules, guillemets et lignes multilignes ; quantités, identifiant Scryfall, extension, numéro, normal/foil/etched, langue, état et section conservés. Les lignes invalides sont signalées et restent à corriger avec l’en-tête ; les bonnes lignes sont enregistrées.
- Identifiants d’impression dédupliqués et résolus par lots de 75, avec progression et cache : pas d’appel API par ligne, y compris pour 30 000 lignes CSV.
- Détail des versions conservé dans la collection pour sa valorisation ; échanges toujours comparés par Oracle ID. Tarifs Cardmarket non ajustés à l’état/langue ; etched non coté sans source fiable. Notes, achats et noms de classeurs ManaBox non importés.
- Export CSV des decks pour préserver aussi langues, états et identifiants ; export texte existant maintenu, avec marqueur etched `*E`.
- Tests de CSV valides/invalides, guillemets, identités d’impression, import/export/réimport, stocks détaillés, 30 000 lignes et limites exactes de 10 Mo ; test du chargement initial d’une ancienne collection non traduite. Aucune dépendance ajoutée, migration SQLite automatique.

## 10. Français après ajout, volet au clic, sélection d’édition et prix dans chaque cadre

- Ajout individuel enrichi du nom français avant réponse ; aucune modification de l’identité Oracle ni des noms canoniques utilisés pour l’export.
- Statut explicite pendant la traduction au lieu d’un nom anglais provisoire ; nouvelle tentative après une panne réseau côté navigateur, sans mémoriser définitivement l’échec. Repli anglais uniquement lorsque aucune traduction n’est disponible dans Scryfall.
- Volet droit actualisé au clic ou activation clavier Entrée/Espace ; survol et navigation des suggestions n’actualisent plus ce volet. Le grand aperçu au survol reste disponible.
- Choix des versions dans un dropdown sous l’image : extension, numéro, date et prix, avec toutes les impressions. Édition choisie conservée au changement normal/foil.
- Prix unitaire moyen Cardmarket AVG dans chaque cadre de deck, collection, wishlist, échange, résultat et suggestion de recherche, en vue cartes comme liste. Édition/numéro/finition respectés quand connus ; `≈` identifie une version de référence. Prix absents et erreurs explicitement signalés, sans faux zéro.
- Chargement automatique des seules cartes affichées, lots de 100 dédupliqués, cache client de dix minutes et cache existant du guide ; erreurs réessayées après une minute. Endpoint authentifié exposant uniquement des cotations de cartes publiques, sans stock ni donnée d’un autre compte.
- Tests d’ajout en anglais retournant immédiatement « Foudre », prix exacts nonfoil/foil, éditions de référence, cas non cotés, déduplication, authentification et limite des lots. Parsing, export et imports de 30 000 lignes inchangés.

## 11. Totaux automatiques, tri/filtres de prix et estimation multi-sources

- Suppression des boutons « Valeur ». Total de collection affiché automatiquement près des listes, avec quantités, éditions/finition enregistrées, exemplaires non cotés, estimation et total partiel si nécessaire. Total indépendant des filtres et de la page visible. Wishlist/decks et valeurs des échanges également calculés automatiquement.
- Recalcul après changements d’inventaire (y compris remplacement du détail des éditions à quantité inchangée) et toutes les dix minutes ; annulation des réponses périmées côté navigateur. Prix et calculs restent séparés de l’import/export.
- Tri croissant/décroissant par prix unitaire et filtres min./max. en EUR, « Avec un prix » / « Sans prix ». Zéro est une valeur cotée valide ; prix absents en dernier dans les deux sens. Dans les decks, filtre/tri appliqués avant pagination et compteurs calculés sur les lignes retenues.
- Total fondé d’abord sur Cardmarket AVG, puis le repère EUR Cardmarket transmis par Scryfall. Si aucun prix EUR n’est disponible, médiane des cotations compatibles d’autres marchés : TCGplayer via les champs USD de Scryfall, ManaPool (prix NM en stock) et CardKingdom (prix de vente NM en stock). Le buylist n’est pas utilisé.
- Correspondance par ID Scryfall d’impression et finition, pas par nom approximatif. Normal, foil et etched isolés ; une finition indisponible ne récupère pas le prix d’une autre. Langue/état de l’inventaire ne font pas l’objet d’un ajustement de tarif : estimation indicative, sans frais de port ni taxes.
- Conversion des USD en EUR par taux daté Frankfurter. Sans taux vérifiable, aucune conversion inventée. Médiane résistante à une offre extrême ; source(s), observations, dates et taux exposés dans l’API et le volet droit. Les estimations portent « ≈ » et entrent dans le total avec compteur d’exemplaires estimés.
- Catalogues publics ManaPool/CardKingdom et taux mis en cache 24 h, requêtes concurrentes mutualisées ; échecs réessayés après une minute, données de repli anciennes exclues après sept jours. Aucun téléchargement par ligne et aucune clé API supplémentaire. L’API directe TCGplayer n’octroyant plus de nouveaux accès, ses cotations sont obtenues via Scryfall.
- Tests de conversion, médiane, identité/finition, données absentes, cache, concurrence, priorité Cardmarket, cotation à zéro, prix hors limites, tri avant pagination, totaux complets et révision des éditions à quantité identique. Tests d’import/export, CSV 10 Mo et 30 000 lignes maintenus.
- Sources vérifiées : [ManaPool OpenAPI](https://manapool.com/api/docs/v1/openapi.json), [CardKingdom catalogue public](https://api.cardkingdom.com/api/v2/pricelist), [Frankfurter](https://frankfurter.dev/), [accès TCGplayer](https://docs.tcgplayer.com/docs/getting-started).
