# Moteur de partie Mana Circle

## Ce que le moteur automatise

Le moteur déterministe de `src/server/game-engine.ts` tient l’état partagé d’une partie à deux joueurs. Cette limite fournit une table duel lisible, proche de l’organisation de MTG Arena. Les parties démarrent depuis les decks enregistrés des participants; les cartes de réserve sont exclues. Les joueurs gardent leur main privée et ne voient que le nombre de cartes dans la main ou la bibliothèque de l’adversaire.

Il gère les étapes de tour, la priorité, les passes, la pile en ordre LIFO, le jeu d’un terrain par tour, la production de mana des terrains de base, les coûts colorés et génériques, les attaquants et bloqueurs, les blessures de combat, le dégagement et la pioche. Les terrains dégagés gardent leur fenêtre de priorité : leur capacité de mana peut être activée à n’importe quelle étape, y compris pendant le tour adverse, et ne passe pas par la pile. Après production de mana, le joueur conserve la priorité pour décider de la suite. Le mana non dépensé est vidé à la fin de chaque étape. Les blessures sont appliquées automatiquement après que les joueurs ont passé la priorité pendant la fenêtre de bloqueurs. Les conditions de fin incluent zéro point de vie, dix marqueurs poison, 21 blessures de commandant d’un même joueur, une bibliothèque vide et la concession.

Les transitions d’état sont pures : `applyAction` retourne un nouvel état et ne modifie pas l’état reçu. L’API refuse les actions de déplacement libre de cartes, qui permettraient de contourner les coûts et les phases.

## Tests et simulations

Les tests unitaires se trouvent dans `tests/game-engine.test.ts`. Les parcours déterministes multi-actions sont dans `tests/game-simulations.test.ts`; les tests d’API et d’isolation des joueurs sont dans `tests/games.test.ts`.

Ils couvrent notamment :

- un duel complet où l’on joue un terrain, produit du mana, lance une créature, effectue des tours et gagne par blessures;
- une réponse instantanée, la résolution de la pile et la reprise du combat;
- deux bloqueurs létaux avec contrôle des cartes déplacées au cimetière;
- les parties multijoueur, les passes de priorité, les joueurs éliminés, l’autorisation des bloqueurs et la concession;
- les actions illégales, le coût des sorts, les zones, la confidentialité des mains et les decks autorisés;
- l’activation d’un terrain pendant le tour adverse, la priorité conservée après production et la vidange du mana à la fin d’une étape.

Pour lancer les tests unitaires et API :

```sh
npm test
```

## Limites connues

Ce moteur constitue un noyau jouable, pas une implémentation complète des règles Oracle. Les cartes non-terrain se résolvent sans appliquer leur texte; les cibles, capacités activées et déclenchées, effets de remplacement et actions basées sur un état ne sont pas simulés. Le mana ne peut être produit automatiquement qu’à partir des cinq sous-types de terrains de base. Les coûts X, hybrides et phyrexians ne sont pas pris en charge.

Le timing de mana suit les règles complètes officielles de Wizards, notamment 106.4, 117.1d et 605.3a–b : [Comprehensive Rules](https://magic.wizards.com/en/rules).

Le combat gère les blessures et plusieurs bloqueurs, mais pas encore le piétinement, l’initiative, la double initiative, le contact mortel, le lien de vie, la menace ni les autres mots-clés de combat. Le mulligan et les règles de construction de deck par format ne sont pas appliqués. Les ajustements de points de vie et de marqueurs restent des commandes de suivi manuel.

Les scénarios simulés valident les transitions implémentées et leurs invariants; ils ne remplacent pas une validation exhaustive de toutes les règles de Magic ou de chaque carte.
