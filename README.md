# 🚆 Train Station ChatOps — La Station Genval (v0.1.1)

Application PWA (Progressive Web App) serverless hébergée sur **Cloudflare Pages**, sécurisée par **Cloudflare Zero Trust**, permettant au responsable de la gare de Genval de consulter et de modifier les horaires, vacances et fermetures exceptionnelles en langage naturel via l'API **Google Gemini**, avec synchronisation directe et sécurisée sur le dépôt GitHub du kiosque.

---

## 🏛️ Architecture & Sécurité

```
[Responsable du site]
        │
        ▼
[Cloudflare Zero Trust] ── (Code PIN envoyé par e-mail, sans mot de passe)
        │
        ▼
[Cloudflare Pages (PWA)] ── (v0.1.0, Service Worker, Mode Offline)
        │
        ▼
[Cloudflare Pages Functions]
   ├── /api/status  ──► [GitHub REST API] (Lecture schedule.json)
   ├── /api/chat    ──► [Google Gemini API] (NLU + Function Calling + Heure de Bruxelles)
   └── /api/confirm ──► [GitHub REST API] (Validation stricte & Commit sécurisé)
                                │
                                ▼
                 [Raspberry Pi de la gare de Genval]
                 (UFW strict, zéro port ouvert, sync Git quotidienne)
```

### Points forts de la conception :
* **Zéro port ouvert sur la gare :** Le Raspberry Pi reste hermétique derrière son pare-feu UFW sur le Wi-Fi public.
* **100% Serverless & Gratuit :** Utilise exclusivement les paliers gratuits pérennes de Cloudflare Pages, Cloudflare Zero Trust (jusqu'à 50 utilisateurs), Google AI Studio (Gemini Flash) et GitHub API.
* **Sécurité & Sas humain obligatoire :** L'IA ne modifie jamais directement les données. Elle propose une carte d'action claire `[Confirmer]` / `[Annuler]` que l'humain doit valider par un clic.
* **PWA & Résilience Offline :** L'App Shell est pré-mis en cache (`kiosk-chatops-v0.1.1`). En cas de coupure réseau, une bannière ambre explicite s'affiche et le dernier planning reste consultable.
* **Ton chaleureux & empathique :** Ambiance conviviale du café de la gare, gestion fine des congés belges et européens, et messages d'erreurs déculpabilisants (pause café du bot, accroc technique en salle des machines).

---

## 🚀 Démarrage Rapide en Local

### Prérequis
* Node.js >= 20
* Cloudflare Wrangler (`npm install -g wrangler` ou via npx)

### 1. Cloner et configurer
```bash
git clone https://github.com/LoupiBe/train-station-chatops.git
cd train-station-chatops

# Créer les fichiers de secrets locaux (strictement ignorés par Git)
cp .env.example .env
cp .dev.vars.example .dev.vars
```

Renseignez vos clés dans `.env` et `.dev.vars` :
* `GEMINI_API_KEY` : Clé API obtenue gratuitement sur [Google AI Studio](https://aistudio.google.com/).
* `GEMINI_MODEL` : `gemini-2.0-flash` (ou toute version plus récente).
* `GITHUB_TOKEN` : Personal Access Token GitHub (Fine-Grained) avec permission `Contents: Read and write` sur le dépôt `train-station-timetable`.
* `GITHUB_OWNER` : `LoupiBe`
* `GITHUB_REPO` : `train-station-timetable`
* `GITHUB_BRANCH` : `main`

### 2. Lancer le serveur local
```bash
npm run dev
# Ou directement :
npx wrangler pages dev public
```
L'application est accessible sur `http://localhost:8788`.

### 3. Exécuter les suites de tests
```bash
# Vérification des fonctions backend (68 tests)
node scripts/verify-m2.js

# Vérification de l'interface PWA et du Service Worker (61 tests)
node scripts/verify-m3.js
```

---

## 🌐 Déploiement en Production sur Cloudflare Pages

### Étape 1 : Créer le projet Cloudflare Pages
1. Connectez-vous sur votre dashboard [Cloudflare](https://dash.cloudflare.com/).
2. Allez dans **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
3. Sélectionnez le dépôt `train-station-chatops`.
4. Paramètres de build :
   * **Framework preset :** `None`
   * **Build command :** *(laisser vide)*
   * **Build output directory :** `public`
   * **Root directory :** `/`
5. Cliquez sur **Save and Deploy**.

### Étape 2 : Configurer les Variables d'Environnement (Secrets)
Dans le projet Cloudflare Pages :
1. Allez dans **Settings** > **Environment variables**.
2. Pour la section **Production** (et **Preview**), ajoutez les variables suivantes en cliquant sur **Encrypt** pour chacune :
   * `GEMINI_API_KEY` : Votre clé Google AI Studio.
   * `GEMINI_MODEL` : `gemini-2.0-flash`
   * `GITHUB_TOKEN` : Votre token GitHub Fine-Grained.
   * `GITHUB_OWNER` : `LoupiBe`
   * `GITHUB_REPO` : `train-station-timetable`
   * `GITHUB_BRANCH` : `main`
3. Redéployez la dernière version pour charger les variables.

---

## 🛡️ Configuration de Cloudflare Zero Trust (Accès sécurisé)

Pour restreindre l'accès à la PWA uniquement au responsable du site :

1. Dans le dashboard Cloudflare, ouvrez **Zero Trust** (dans le menu latéral gauche).
2. Allez dans **Access** > **Applications** > **Add an application**.
3. Choisissez **Self-hosted**.
4. Remplissez les informations de base :
   * **Application name :** `Kiosk ChatOps - Station Genval`
   * **Application domain :** Choisissez un sous-domaine (ex: `chatops.votre-domaine.com`) ou le domaine `.pages.dev`.
5. Dans l'onglet **Policies** (Politique d'accès) :
   * **Policy name :** `Responsables Autorisés`
   * **Action :** `Allow`
   * **Rule type :** `Include`
   * **Selector :** `Emails`
   * **Value :** Saisissez l'adresse e-mail exacte du responsable (et la vôtre).
6. Dans **Identity providers** :
   * Laissez coché **One-time PIN** (envoi automatique d'un code PIN à 6 chiffres par e-mail).
7. Enregistrez l'application.

Désormais, toute personne ouvrant l'URL recevra un code PIN unique par e-mail. Aucun mot de passe à retenir, sécurité totale.

---

## 📱 Installation de la PWA sur Smartphone

1. Ouvrez l'URL de votre application dans **Chrome** (Android) ou **Safari** (iOS).
2. Connectez-vous avec votre adresse e-mail via le code PIN Cloudflare.
3. Cliquez sur le menu du navigateur :
   * Sur Android : **Installer l'application** ou **Ajouter à l'écran d'accueil**.
   * Sur iOS : Bouton de partage > **Sur l'écran d'accueil**.
4. L'application apparaît comme une vraie application native avec son icône de train, s'ouvre en plein écran et fonctionne même hors ligne pour consulter le planning.

---

## 📄 Licence

Ce projet est sous licence MIT. Développé pour La Station Genval.
