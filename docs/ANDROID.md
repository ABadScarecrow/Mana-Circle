# Installer Mana Circle sur Android

Mana Circle peut être installée comme application web depuis Chrome sur Android. Le manifeste définit son nom, son icône, sa page de démarrage et l’ouverture en mode autonome. Chrome accepte cette installation à partir d’un site HTTPS doté d’un manifeste valide et d’icônes 192 × 192 et 512 × 512.

1. Déployer Mana Circle derrière une adresse HTTPS stable. Les URL temporaires de Quick Tunnel changent et rendent le raccourci installé inutilisable après leur rotation.
2. Ouvrir l’adresse dans Chrome sur Android et se connecter normalement.
3. Ouvrir le menu ⋮ puis choisir **Installer l’application** ou **Ajouter à l’écran d’accueil**.

L’application installée utilise le même site et la même API que la version web. Elle nécessite Internet et que le serveur Mana Circle soit disponible ; le brouillon local du deck reste sur l’appareil. Ce paquet PWA n’est pas un APK publié sur Google Play.

Pour produire et distribuer un APK ou AAB natif, le projet devra être enveloppé avec Capacitor et construit avec Android Studio et l’Android SDK. Cette machine de travail ne dispose actuellement ni d’Android Studio, ni d’Android SDK/ADB, ni de Gradle.
