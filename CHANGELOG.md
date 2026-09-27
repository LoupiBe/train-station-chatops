# Journal des Modifications (Changelog)

Toutes les modifications notables apportées à ce projet sont documentées dans ce fichier.
Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), et ce projet adhère à la [Gestion Sémantique de Version (SemVer)](https://semver.org/lang/fr/).

---

## [0.1.4] - 2026-09-27

### Modifié
- Message d'accueil du bot enrichi : rappel explicite de la consultation des horaires encodés via le bouton `[📅 Horaires]` et de la validation systématique par bouton de confirmation interactif.
- Notification de synchronisation nocturne : mise en évidence sur le badge de confirmation finale (`badge-success`) que les modifications seront prises en compte sur le kiosque physique durant la nuit.

---

## [0.1.3] - 2026-09-27

### Modifié
- Refonte et clarification de l'identité de marque « Assistant des horaires La Station » :
  - Intégration du logo officiel de La Station (`https://lastation-genval.be/images/logo.png`) dans l'en-tête de l'application et déclinaison en icônes PWA haute résolution (`icon-192.png`, `icon-512.png`).
  - Titre principal de l'en-tête mis à jour vers `La Station` avec sous-titre `Assistant des horaires`.
  - Titre HTML `<title>` et nom PWA dans `manifest.json` mis à jour vers `Assistant des horaires La Station` (short_name: `La Station`).
  - Message d'accueil du chat et libellés d'actions adaptés pour refléter le café La Station (`Réouverture de La Station`, etc.).
  - Clarification explicite des instructions système de l'agent IA : La Station est un café indépendant situé à la gare de Genval, gérant exclusivement ses propres horaires et non ceux des trains de la SNCB.

---

## [0.1.2] - 2026-09-26

### Ajouté
- Moteur de filtrage temporel intelligent dans le tiroir d'horaires (`ScheduleViewController`) :
  - Recherche par date spécifique (formats ISO `YYYY-MM-DD`, `JJ/MM`, `JJ mois` ex: `14 mai`, `28 décembre`, `15/08`) affichant l'ensemble des fermetures, horaires exceptionnels et ouvertures exceptionnelles couvrant la date.
  - Résolution automatique du jour de la semaine concerné dans la grille des horaires habituels (`#weekly-table-body`).
  - Filtrage par mois en français (`mai`, `décembre`, `août`, etc.) affichant tous les événements et exceptions du mois concerné.
  - Dictionnaire et calcul dynamique des jours fériés légaux belges (Ascension, Pâques, Pentecôte, 1er mai, 21 juillet, 15 août, 1er novembre, 11 novembre, Noël, Nouvel An) et des congés scolaires Fédération Wallonie-Bruxelles (Carnaval / Détente, Printemps, Été, Automne / Toussaint, Hiver / Noël).
  - Suite complète de tests unitaires dédiée dans `tests/unit/schedule-search.test.js`.

### Modifié
- Harmonisation de l'identité de marque (« La Station ») :
  - Mise à jour du libellé de la barre inférieure (`.footer-station`) vers `La Station`.
  - Mise à jour du titre d'en-tête (`.brand-title`) vers `La Station — Kiosque`.

---

## [0.1.1] - 2026-09-26

### Ajouté
- Prise en charge des horaires particuliers / exceptionnels (`special_schedules`) :
  - Outils Gemini API `propose_special_schedule` et `propose_remove_special_schedule`.
  - Section dédiée dans le tiroir latéral de consultation des horaires avec badges d'ouverture/fermeture.
  - Cartes d'action interactives dans le chat avec validation par double confirmation.
  - Suite de tests unitaires dédiée dans `tests/unit/special-schedules.test.js`.

### Modifié
- Nettoyage et simplification de l'interface utilisateur (UI) :
  - Retrait du suffixe `(SNCB)` dans la barre de statut inférieure (`footer-station`).
  - Suppression de la pastille de statut réseau `En ligne` dans les contrôles d'en-tête supérieurs pour un affichage plus sobre.
- Mise en place d'un script d'automatisation du versioning (`scripts/bump-version.js`).

---

## [0.1.0] - 2026-09-26

### Ajouté
- Version initiale de la Progressive Web App (PWA) Train Station ChatOps pour La Station Genval.
- Intégration de l'API Google Gemini avec persona d'agent de gare chaleureux et bienveillant.
- Synchronisation bidirectionnelle GitHub Contents API pour la persistance des horaires.
- Support offline complet via Service Worker avec stratégie de cache différenciée (`kiosk-chatops-v0.1.0`).
- Affichage de l'horloge officielle de Bruxelles en temps réel (fuseau `Europe/Brussels`).
- Bannière d'installation PWA mobile avec gestion du délai de réapparition de 7 jours.
- Documentation complète de déploiement et sécurisation Cloudflare Zero Trust Access.
