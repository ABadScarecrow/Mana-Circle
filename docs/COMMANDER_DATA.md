# Données Commander et recommandations

## Architecture de la première version

Les données communautaires vivent dans `commander_sources`, `commander_decks` et `commander_deck_cards`, séparées des decks personnels (`decks`, `deck_cards`). Les cartes sont jointes par `oracle_id`; les impressions restent dans le catalogue `card_printings`. Le pipeline tourne en maintenance, réutilise `parseDeck` et le resolver Scryfall existants, puis matérialise inclusions et associations dans `commander_card_stats` et `commander_card_associations`.

L’import est idempotent par couple source/identifiant externe. Le défaut `manual:<nom-de-fichier>` permet de réimporter le même fichier avec ses mises à jour; indiquez `--deck-id` stable pour éviter les collisions entre fichiers de même nom. Les erreurs de parsing ou de résolution arrêtent l’import complet. Les doublons de cartes sont normalisés en une ligne par identité et section.

## Exemple reproductible

1. Préparez un fichier texte avec une section `Commander` (ou fournissez `--commander`), puis les sections `Deck`, `Sideboard` et `Maybeboard` habituelles.
2. Importez avec `npm run commander-data -- import --file ./deck.txt --commander "Nom du commandant" --author "Auteur" --url "https://source/deck" --deck-id auteur/deck`.
3. Recalculez avec `npm run commander-data -- stats`, puis inspectez avec `npm run commander-data -- report`.
4. Dans le deckbuilder, choisissez ce commandant et lancez les suggestions : les statistiques pré-calculées sont combinées aux signaux de synergie existants. Le serveur filtre les cartes dont la légalité Commander est inconnue ou non légale et vérifie l’identité couleur via les données Scryfall locales.

`DB_PATH` pointe vers la base SQLite configurée. Le resolver réutilise le cache Scryfall et les limites du client existant; une carte inconnue fait échouer l’import au lieu d’être supprimée silencieusement. `npm run commander-data -- delete-source --source-id manual` supprime explicitement les decks de cette source et recalcule les statistiques. Aucune commande de collecte générale n’existe.

## Mesures et limites

La fréquence utilise le nombre de decks contenant la carte, séparé du nombre total de copies. L’association conserve cooccurrence, probabilité conditionnelle et lift. Le score de recommandation est : `taux_inclusion × min(1, ln(1 + population) / ln(21)) + somme(taux_conditionnel × clamp(lift, 0.25, 2) × min(1, ln(1 + cooccurrence) / ln(21)))`. Les associations sont prises en compte à partir de deux decks. La confiance est faible sous 5 decks ou une seule source, moyenne entre 5 et 19 decks ou moins de 3 sources, élevée à partir de 20 decks issus d’au moins 3 sources. Ce seuil décrit uniquement la taille et diversité de l’échantillon, pas une garantie statistique.

Les associations sont des cooccurrences ajustées par la popularité, pas une preuve de synergie fonctionnelle. Les tags fonctionnels continuent d’utiliser les règles explicites existantes de `deckbuilder-synergy.ts`; aucune IA n’est exécutée. Budget et collection restent traités par le deckbuilder existant et ne sont pas encore incorporés dans le score de fréquence.

## Sources et conditions d’accès

| Source | Mode actuellement activé | Réutilisation et limites connues | Repli |
| --- | --- | --- | --- |
| Import manuel | Texte local, provenance `manual` | L’importateur ne publie pas les listes; conserver URL/auteur si fournis et respecter les droits attachés aux listes. | Texte ou CSV déjà pris en charge. |
| Archidekt | Désactivé, aucun connecteur réseau | Le paquet npm `archidekt` repéré est ancien, MIT et explicitement non affilié; son API cible est non documentée et susceptible de changer. Ni permission de collecte ni débit autorisé n’ont été vérifiés. | Export/import texte manuel. |
| Moxfield | Aucun fetch d’URL | Pas d’API publique officielle vérifiée. Les conditions consultées interdisent l’automatisation sans consentement écrit; aucun jeton navigateur ou mécanisme anti-bot ne sera utilisé. | Export/copie de decklist par son utilisateur. |
| AetherHub | Aucun fetch d’URL | Les exports et l’embed public sont documentés, mais aucune API deck documentée ni licence de réutilisation des listes n’a été confirmée. | Export/copie texte par l’utilisateur; URL conservée comme provenance à sa demande. |
| Scryfall | Service et bulk existants | Référentiel des cartes, pas source de decks. Utiliser Oracle IDs, cartes multi-faces, legalities, identité couleur et prix avec cache; le site demande moins de 10 requêtes/s et recommande le bulk pour les grands volumes. | Dernières données locales; légalité inconnue reste exclue. |

Références consultées le 15 octobre 2026 : [package Archidekt](https://www.npmjs.com/package/archidekt), [conditions Moxfield](https://sorcery.moxfield.com/help/terms), [documentation AetherHub](https://aetherhub.com/Docs/About) et [conditions AetherHub](https://aetherhub.com/TermsAndConditions), [limites API Scryfall](https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-im-blocked-17), [bulk Scryfall](https://scryfall.com/docs/api/bulk-data). Vérifier les conditions à nouveau avant toute automatisation ou redistribution. Le paquet Archidekt n’est pas installé : sa maintenance et son contrat de réponse n’offrent pas assez de garanties pour le brancher sans validation supplémentaire.

## Déploiement Raspberry Pi

À ce stade, les agrégats sont dans la base opérationnelle SQLite existante. Ne remplacez pas cette base : elle contient comptes, sessions, invitations, collection et decks personnels. Pour transférer des données, faites une sauvegarde SQLite cohérente, importez le corpus et ses stats sur une copie de base, vérifiez `npm run commander-data -- report` et les clés étrangères, puis basculez la copie complète avec arrêt contrôlé du serveur. La production ne requiert pas de recalculer les paires à chaque requête; seules les lectures indexées du commandant et des cartes du deck sont faites. Un bundle séparé de référence et un remplacement atomique sans données personnelles restent à développer avant automatisation du déploiement.

Pour restaurer, arrêter le serveur et remettre la sauvegarde cohérente complète; ne restaurez pas seulement les agrégats d’une version différente du schéma. Le volume dépend du corpus : les associations sont quadratiques par nombre de cartes de chaque deck, donc ne pas importer de collection globale sans autorisation et budget de stockage mesuré.
