# Journal des Modifications (Changelog)

Toutes les modifications notables apportées à ce projet sont documentées dans ce fichier.
Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), et ce projet adhère à la [Gestion Sémantique de Version (SemVer)](https://semver.org/lang/fr/).

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
