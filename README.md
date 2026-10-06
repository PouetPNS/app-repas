# Mes idées repas

Application personnelle d'idées de repas végétariennes : suggestions équilibrées et rapides,
notation à trois niveaux, re-proposition automatique après un délai, et liste de courses
générée à partir des ingrédients (bruts ou tout prêts).

## Structure du projet

```
app-repas/
├── index.html              Structure de la page (3 onglets)
├── css/style.css           Styles (mobile-first, aucune dépendance)
├── js/data.js              Catalogue des repas, apports, délais de re-proposition
├── js/sync.js              Synchronisation multi-appareils via GitHub
├── js/app.js               Logique (suggestions, notation, courses) et rendu
├── manifest.webmanifest    Installation sur l'écran d'accueil du téléphone (PWA)
├── sw.js                   Cache hors-ligne (service worker)
└── img/icon-192.png, icon-512.png
```

Aucune dépendance, aucun build : du HTML/CSS/JS pur.

## Utiliser sur PC et téléphone (recommandé)

L'app est mise en ligne gratuitement sur **GitHub Pages**, installable sur le téléphone
comme une application (PWA), avec **synchronisation automatique** entre appareils via un
dépôt GitHub privé. Une seule fois à la mise en place, ensuite tout est automatique.

### 1. Créer les dépôts (une fois, ~10 minutes)

1. Crée un compte sur [github.com](https://github.com) et connecte-toi.
2. **Dépôt de l'app (public)** : en haut à droite, **+** > *New repository*, nomme-le
   `app-repas`, coche *Public*, ne coche aucun README, puis *Create repository*.
3. Sur la page du dépôt vide, clique sur **« uploading an existing file »** et glisse
   le contenu du dossier `app-repas` **sauf le dossier `.vscode`** (dans l'ordre :
   `index.html`, `css/`, `js/`, `img/`, `manifest.webmanifest`, `sw.js`, `README.md`).
   Puis *Commit changes*.
4. **Active GitHub Pages** : dans le dépôt `app-repas`, *Settings* > *Pages* > *Branch* :
   `main` / `(root)` > *Save*. Attends 1 à 2 minutes. L'app est accessible sur :
   `https://PouetPNS.github.io/app-repas/`
5. **Dépôt des données (privé)** : *New repository*, nomme-le `app-repas-data`, coche
   **Private**, *Create repository*. Rien d'autre à faire, il peut rester vide.
6. **Crée le jeton d'accès** : photo de profil > *Settings* > tout en bas *Developer
   settings* > *Personal access tokens* > **Fine-grained tokens** > *Generate new token* :
   - *Token name* : `app-repas` ; *Expiration* : 1 an par exemple.
   - *Repository access* : **Only select repositories** > sélectionne `app-repas-data`.
   - *Permissions* > *Repository permissions* > **Contents** : **Read and write**.
   - *Generate token*, et **copie tout de suite** le jeton (`github_pat_…`) : il ne
     sera plus affiché ensuite.

### 2. Activer la synchronisation (une fois par appareil)

1. Ouvre l'app en ligne sur ton **PC**, onglet **Historique** > section *Synchronisation* :
   remplis pseudo GitHub, nom du dépôt de données (`app-repas-data`) et le jeton, puis
   **Activer**. Le statut doit passer à « Synchronisé à … ».
2. Sur le **téléphone** : le plus simple est le bouton **« Lien appareil »** sur le PC —
   il copie un lien qui configure le téléphone automatiquement (envoie-le-toi par un
   moyen dont tu es seul destinataire : le lien contient le jeton). Ouvre ce lien sur le
   téléphone, valide, c'est fait.
   Sans le lien : ouvre l'URL de l'app sur le téléphone et saisis les trois mêmes
   champs dans la section Synchronisation.
3. **Installe l'app** sur le téléphone : ouvre l'URL dans Chrome/Safari > menu >
   **« Ajouter à l'écran d'accueil »**. Elle s'ouvre ensuite comme une vraie app,
   sans barre de navigateur.

### Comment ça marche

- Tes données (repas, notes, courses) sont stockées dans `data.json` du dépôt privé
  `app-repas-data`. Chaque appareil équipé du jeton lit et écrit ce fichier via l'API
  GitHub. Personne d'autre n'y a accès (dépôt privé).
- Chaque action (note, coche de course, ajout d'idée) est envoyée dans la foulée ;
  au retour sur l'app, le distant est récupéré. **Le plus récent gagne** : évite de
  modifier sur les deux appareils en même temps hors couverture réseau.
- Cas particulier : si tu actives la sync alors que les deux côtés contiennent déjà des
  données, elles sont **fusionnées** au premier lancement (aucune perte).
- Hors ligne (supermarché) : l'app se charge depuis le cache et les modifications
  partent dès le retour du réseau.
- Le jeton reste dans le stockage de ton navigateur, il n'est visible nulle part
  ailleurs. Il donne accès **uniquement** au dépôt de données, pas au reste du compte.
- **Expiration du jeton** : quand il expire, la sync affiche une erreur 401 — il suffit
  de générer un nouveau jeton et de refaire « Activer » sur chaque appareil.
- Exporter/Importer (JSON) continue de fonctionner et sert de sauvegarde papier.

## Lancer l'app pendant le développement

Option 1 — double-cliquer sur `index.html` (sync et installation désactivées en `file://`).

Option 2 — VS Code : ouvrir ce dossier, puis avec l'extension **Live Server**, clic droit
sur `index.html` > *Open with Live Server*.

## Modifier le catalogue des repas

Tout se passe dans `js/data.js` :

- `BASE_MEALS` : les repas (nom, temps, `tags` d'apports, `ing` ingrédients avec quantité, `etapes`).
- `DELAYS` : délais de re-proposition en jours selon la note (`0` = pas ouf, `1` = ok, `2` = j'aime).
- `NUTRI` : les apports suivis (affichés dans la barre du haut sur les 7 derniers jours).

Les repas ajoutés depuis le formulaire dans l'application sont enregistrés séparément
(dans le navigateur, puis dans le dépôt de données si la sync est active).

Après une modification du code ou du catalogue : redéposer les fichiers dans le dépôt
GitHub (`Add file` > *Upload files*), la mise en ligne suit en 1 à 2 minutes.

## Données et sauvegarde

Trois niveaux :

1. **localStorage** du navigateur (cache local, permet d'ouvrir l'app hors ligne).
2. **Sync GitHub** (dépôt privé) — la référence entre appareils.
3. **Exporter/Importer** (onglet Historique) — fichier JSON complet, pense-y de temps
   en temps comme sauvegarde.

Attention : le stockage local dépend de l'origine. `index.html` ouvert en `file://`,
la même page via Live Server et l'URL GitHub Pages ont des stockages séparés. Utilise
l'URL GitHub Pages partout au quotidien ; la sync réconcilie tout de toute façon.
