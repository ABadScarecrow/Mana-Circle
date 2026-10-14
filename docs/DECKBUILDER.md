# Deckbuilder

## Vues et densité

Le deckbuilder propose l’affichage en cartes et en liste. Le sélecteur de taille modifie la largeur des cartes et la hauteur des lignes dans les deux colonnes, la collection et le deck en cours. La collection source est paginée : 24 cartes par page en vue cartes et 60 en vue liste. Une recherche ou un changement de vue revient à la première page.

Les variables CSS de taille sont appliquées au conteneur du deckbuilder afin qu’elles héritent dans ses deux panneaux. Les bornes sont centralisées dans `src/client/deckbuilder-model.ts`.

La courbe de mana et la liste des cartes sélectionnées sont regroupées en haut. Cette liste conserve le réglage des quantités et le choix du commandant, peut être filtrée par valeur de mana, et propose un tri par nom ou par type. Les recommandations peuvent être triées par synergie ou par type.

## Suggestions

Quand un commandant est désigné et que le deck contient des cartes, le client envoie au serveur les identifiants Oracle et quantités présents. Après une courte temporisation, l’API authentifiée demande à Commander Spellbook les combos presque complètes et calcule des synergies à partir des textes Oracle Scryfall du deck et du catalogue local. Jusqu’à 80 suggestions sont affichées ; les cartes déjà dans le deck et celles hors identité couleur sont exclues. Le bouton **Ajouter** ajoute la suggestion au deck ; aucune carte n’est insérée automatiquement.

Le score de synergie de 0 à 100 est une heuristique explicable calculée à partir des types de cartes et de rôles complémentaires détectés dans les textes Oracle. Les familles couvertes incluent notamment tribus, sorts, créatures/ETB/attaque/mort, jetons, sacrifice, cimetière, terrains/landfall, mana, pioche, vie, marqueurs/prolifération, artefacts, enchantements/aura, équipement, exil, énergie et poison. Les types Instant/Sorcery, Creature, Land, Artifact et Enchantment peuvent servir d’indices d’événement pour relier une carte sans texte pertinent à un payoff; une créature peut aussi fournir une cible à réanimer, équiper, enchanter ou sacrifier. Le texte Oracle des deux faces des cartes double-face est analysé. Les rôles seuls ne suffisent pas toujours : le classement favorise les paires moteur/payoff et donne moins de poids à un partage de sous-type non mentionné par le texte.

Le prix bas moyen affiché sous une suggestion utilise les impressions FR/EN présentes dans le catalogue local et les prix bas Cardmarket disponibles pour la finition choisie. Les impressions sans prix bas sont exclues du calcul ; si aucune impression éligible n’a de prix, l’indicateur reste vide. Ce prix bas moyen ne constitue pas le score de synergie et n’est pas une garantie de vente.

Le score ne représente pas une probabilité, une force de carte ni une fréquence de jeu, et ne garantit pas l’exhaustivité de toutes les interactions de règles. La couleur est accompagnée d’une valeur numérique. Au survol d’une carte suggérée, son tooltip liste les cartes du deck qui étayent la synergie, ainsi que les cartes, étapes et résultats des combos Spellbook. Sous la carte figurent le score et le prix bas moyen ; aucun détail de combo n’est répété sous la carte.

Le moteur utilise les textes Oracle structurés par Scryfall ([API et données de cartes](https://scryfall.com/docs/api)) et les combos vérifiées et détaillées par Commander Spellbook ([schéma officiel](https://backend.commanderspellbook.com/schema/), [guide de recherche](https://commanderspellbook.com/syntax-guide/)). Scryfall ne fournit pas lui-même de score de synergie : les scores généraux restent donc des heuristiques plutôt que des métriques de cooccurrence de decks.

La couverture du cas Krenko a aussi été comparée à des listes et analyses indépendantes : MTGGoldfish identifie explicitement les effets de célérité, les Goblin Chieftain/Warchief, les payoffs d’arrivée comme Impact Tremors et les sorties de sacrifice ([exemple de deck Krenko](https://www.mtggoldfish.com/deck/3679399)). Les sous-types et le texte Oracle de Krenko sont vérifiables sur [mtg.wtf](https://mtg.wtf/card/fdn/204/Krenko-Mob-Boss). Ces sites ont servi à valider les catégories de liens; le calcul en production reste local et fondé sur les données de cartes Scryfall, sans importer de score de popularité externe.

Les appels Spellbook sont faits côté serveur avec un délai maximal, une file, une limite de cadence, une déduplication des requêtes simultanées et un cache mémoire de 15 minutes. Le calcul heuristique est local et ne conserve pas de données de deck en base. Les cartes proposées sont ajoutées au catalogue local si elles n’y figurent pas encore, ce qui permet de les ajouter et de les enregistrer normalement.

## Avertissements Commander

La section d’avertissements signale notamment un total différent de 100 cartes, l’absence ou la quantité incorrecte du commandant, les doublons, l’identité couleur et les statuts de légalité. Ce sont des avertissements informatifs : les cartes illégales sont acceptées et l’enregistrement n’est pas bloqué.

## Tests

Les tests unitaires associés incluent `tests/deckbuilder-model.test.ts` (calcul et bornes des tailles), `tests/deckbuilder-filters.test.ts` (filtres, erreurs et périmètres), `tests/commander-suggestions.test.ts` (exclusion, agrégation, tri, cache, déduplication et erreurs HTTP) et `tests/deckbuilder-synergy.test.ts` (tribu, célérité, jetons, spellslinger, terrains, ETB/blink, pioche, artefacts, enchantements, poison, combat, mana, sacrifice, cimetière et gain de vie). Le prix bas moyen est couvert par `tests/all-edition-prices.test.ts` et `tests/card-prices.test.ts`. Ils utilisent des données locales pour ne pas dépendre de la disponibilité des sources.

```bash
npm test
npm run build
```
