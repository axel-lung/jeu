# Nations Defense

Hybride tower defense / RTS en 2.5D isométrique, d'après le document de design
[`.claude/SKILL.md`](.claude/SKILL.md). **État actuel : les deux zones (défense + farm)
sont jouables sur 10 vagues.**

Le jeu se joue à la souris **et au doigt** : la même base de code sert le site, la PWA
installable sur l'écran d'accueil, et les applications Android/iOS empaquetées par
Capacitor — voir [MOBILE.md](MOBILE.md).

## Lancer

```bash
npm install
npm run dev      # http://localhost:5173
npm run serveur  # relais 1 vs 1 sur le port 8080 (Vite y renvoie /ws)
npm run build    # vérification des types + build de production
```

Pour une partie en 1 vs 1 : lancez `npm run serveur`, puis ouvrez le jeu dans deux
navigateurs, choisissez **1 vs 1**, entrez le **même code de salon** des deux côtés et
cliquez « Je suis prêt ». La partie démarre quand les deux joueurs sont prêts.

En production, un seul processus suffit — voir [Héberger](#héberger).

## Commandes

| Action | Souris / clavier | Tactile |
| --- | --- | --- |
| Lancer la partie (depuis le menu) | Bouton, ou `Entrée` | Bouton |
| Choisir quoi poser | Clic sur une carte de boutique, ou `1` … `6` | Tap sur une carte |
| Poser / sélectionner | Clic gauche | Tap ; ou glisser pour viser et lâcher pour poser |
| Annuler la sélection | Clic droit ou `Échap` | Appui long, ou bouton ✕ |
| Changer de zone (défense ↔ farm) | Bouton, onglet de boutique, ou `Tab` | Bouton ou onglet |
| Améliorer la tour sélectionnée | Bouton du panneau, ou `U` | Bouton du panneau |
| Changer le mode de ciblage | Bouton du panneau, ou `C` | Bouton du panneau |
| Vitesse ×1 / ×2 / ×3 | Bouton, ou `V` | Bouton |
| Déplacer la caméra | `WASD` / `ZQSD` / flèches, ou glisser au bouton droit | Glisser à un doigt (deux doigts si un outil est en main) |
| Zoom | Molette | Pincer, ou boutons + / − |
| Rejouer / retour menu (écran de fin) | Boutons, ou `R` / `M` | Boutons |

Sur mobile le jeu se joue **en paysage** ; en portrait, un bandeau invite à tourner
l'appareil.

Les vagues **partent toutes seules** : 30 s avant la première, puis 20 s après chaque
vague tenue. Le compte à rebours est dans la barre du haut et la barre de progression
en haut de l'écran se remplit — elle passe au rouge pendant l'assaut.

## Difficulté : deux axes indépendants

Le menu de démarrage croise deux réglages, ce qui donne neuf parties différentes.
La carte générée s'affiche derrière le menu et se régénère à chaque changement.

**Ferme** — combien on récolte et à quel prix on construit :

| | Spots | Stock de départ | Prix |
| --- | --- | --- | --- |
| Abondante | 18 | ×1,4 | ×0,85 |
| Normale | 14 | ×1 | ×1 |
| Aride | 12 | ×0,8 | ×1,1 |

**Carte** — la pression subie :

| | Chemin | Encombrement | PV ennemis |
| --- | --- | --- | --- |
| Sinueuse | ~66 cases | 4 % | ×0,92 |
| Équilibrée | ~48 cases | 30 % | ×1 |
| Directe | ~36 cases | 52 % | ×1,15 |

> **Pourquoi trois leviers et pas seulement la longueur ?** Parce que mesuré, la
> longueur seule ne fait presque rien : un chemin court est aussi plus facile à
> couvrir. Sur les 15 meilleurs emplacements, les tours arrosent le chemin ×2,52 sur
> `sinueuse` mais ×3,83 sur `directe` — le tracé perd 45 % de sa longueur et la
> couverture n'en perd que 16 %. Les deux effets s'annulent presque.
>
> L'encombrement raréfie les bons postes, mais il sature lui aussi : 15 tours de
> portée 3 blindent à peu près n'importe quel tracé, et l'écart plafonne vers 20 %.
> La longueur reste donc la **signature visible** de l'axe, et la pression sur les PV
> lui donne le **mordant** — sans elle, les trois crans se ressemblent en jeu.

## La map

Une seule grille isométrique, en face à face. **Trois zones** : votre ferme, la zone
défense centrale coupée en deux bandes, et la ferme adverse.

```
            gx 0…15      16       gx 17…37        38      gx 39…54
          ┌──────────┬────────┬───────────────┬────────┬──────────┐
  gy 0…11 │  FERME A │clôture │  DÉFENSE A ←  │clôture │          │
          │          │        ├───────────────┤        │  FERME B │
 gy 12…23 │          │        │  DÉFENSE B →  │        │          │
          └──────────┴────────┴───────────────┴────────┴──────────┘
```

Les ennemis **entrent par le côté adverse** et marchent vers le village du joueur,
adossé à sa ferme : chacun défend la voie qui protège sa propre économie. En solo, la
carte s'arrête après la défense — une seule bande, une seule ferme (38 × 12).

Garder une grille unique plutôt que des scènes séparées fait que le picking, le tri en
profondeur et la caméra marchent à l'identique partout, y compris sur le camp d'en
face. Le sol adverse est légèrement désaturé pour qu'on sache toujours chez qui l'on
regarde. `Tab` fait le tour des quatre vues : ma défense, ma ferme, sa défense, sa
ferme.

### Génération procédurale

Le chemin est tiré sur un **treillis 6 × 6 dont les nœuds sont espacés de 3 tuiles**
([`src/game/mapgen.ts`](src/game/mapgen.ts)). C'est ce qui garantit qu'il ne se colle
jamais à lui-même : deux couloirs parallèles gardent toujours 2 tuiles libres, de quoi
poser des tours des deux côtés.

La recherche est un DFS randomisé qui vise une longueur *exacte*, avec deux élagages
qui la rendent instantanée : il faut qu'il reste assez de pas pour atteindre l'arrivée,
et que la parité colle (sur une grille, longueur de chemin et distance de Manhattan ont
toujours la même parité). Mesuré sur 600 cartes : ~0,1 ms par carte, zéro échec.

Les spots de la ferme sont placés par bandes thématiques — champs au nord, bosquets à
l'ouest, filons à l'est, carrières au sud-est — avec au moins une tuile libre entre
deux spots pour pouvoir glisser un bâtiment.

## Ce qui est implémenté

- **Rendu 2.5D** : projection isométrique maison, tri par profondeur de toutes les
  entités, ombres portées, sprites dessinés à la main en Canvas (aucun asset externe).
- **Zone défense** : chemin sinueux, entrée/sortie, grille constructible, décor bloquant.
- **2 tours** : Coq Gaulois 🇫🇷 (anti-masse, sol uniquement) et Aigle Chauve 🇺🇸
  (sol + air, ×2 contre les volants). 4 niveaux chacune, dont un niveau 4 signature
  (gerbe de confettis à dégâts de zone / éclair en chaîne).
- **4 ennemis** : Goblinet Pilleur, Bunny Demon (rapide), Chibi Bat (volant),
  Chibi Titan (mini-boss avec bouclier, libère 3 Goblinets en éclatant).
- **Zone farm** : 14 spots (5 champs, 4 bosquets, 3 filons, 2 carrières), bébés
  animaux récolteurs qui éclosent d'un œuf en 10 s, 4 bâtiments qui boostent les
  spots alentour (Moulin, Camp de bûches, Camp de mine, Entrepôt).
- **2 bébés** : Poussin 🇫🇷 (+30 % nourriture) et Aiglon 🇺🇸 (+25 % or et pierre).
- **10 vagues** scriptées, boss à la 10, modes de ciblage (premier / dernier / plus
  fort / plus proche).

## L'économie

Cinq monnaies, chacune avec un rôle distinct :

| Monnaie | Vient de | Sert à |
| --- | --- | --- |
| 🌾 Nourriture | champs de blé | élever les bébés, et **les entretenir** (0,12/s chacun) |
| 🪵 Bois | bosquets | Coq, Moulin, Camp de bûches |
| 🪙 Or | filons + kills + fin de vague | toutes les tours |
| 🪨 Pierre | carrières | Aigle, Camp de mine, Entrepôt |
| 👻 Âmes | uniquement les kills | **uniquement les upgrades de tours** |

Deux mécanismes tiennent l'économie :

- **Coûts en escalade** : le n-ième exemplaire coûte `base × facteur^n` (tours 1,08 ·
  bébés 1,10 · bâtiments 1,30). Sans ça, une ferme mature finance une forêt de tours
  de niveau 1 et les upgrades deviennent inutiles.
- **Entretien des bébés** : sans lui, la nourriture n'a plus aucun débouché une fois
  les 14 spots occupés et s'empile par milliers.

Les ennemis qui atteignent la sortie coûtent des vies **et** pillent une ressource
précise : le Goblinet prend de la nourriture, le Bunny du bois, le Bat de l'or.

## Équilibrage

Vérifié par simulation headless — `Game` n'a aucune dépendance au DOM, il tourne tel
quel dans Node. Une IA volontairement naïve joue les 9 combinaisons, 3 graines chacune
(vies restantes moyennes sur 100) :

| Ferme \ Carte | Sinueuse | Équilibrée | Directe |
| --- | --- | --- | --- |
| **Abondante** | 95 | 87 | 38 |
| **Normale** | 87 | 92 | 2 (1 victoire sur 3) |
| **Aride** | 86 | 60 | défaite ~vague 7 |

Comme l'IA joue moins bien qu'un humain (placement quelconque, upgrades au jugé),
ces chiffres sont un plancher. `aride × directe` est le coin expert : la simulation
naïve n'y arrive pas.

Deux garde-fous trouvés en calibrant, à ne pas défaire sans mesurer :

- **`directe` ne doit pas descendre sous 12 segments.** À 9 segments (~30 cases),
  aucun placement ne couvre assez le chemin : les fuites de la vague 3 déclenchent une
  spirale (moins de kills → moins d'âmes → moins de tours) dont on ne sort plus.
- **`aride` doit garder 3 filons d'or.** À 2 filons la partie n'est pas difficile, elle
  est infaisable : l'or finance toutes les tours.

Les leviers sont dans [`src/game/waves.ts`](src/game/waves.ts) (composition, `facteurPv`,
récompenses), [`src/game/enemies.ts`](src/game/enemies.ts) (PV, vitesses, butin),
[`src/game/towers.ts`](src/game/towers.ts) (niveaux, coûts) et
[`src/game/farm.ts`](src/game/farm.ts) (taux de récolte, entretien, bonus).

## Architecture

```
src/
├─ core/        projection iso, caméra, entrées, utilitaires (sans logique de jeu)
│  ├─ input.ts     pointeur unifié souris/doigt : tap, glisser, pincement, appui long
│  └─ mobile.ts    plein écran, orientation, gestes du navigateur, service worker
├─ game/        simulation pure, sans DOM
│  ├─ mapgen.ts     génération procédurale du chemin et des spots
│  ├─ map.ts        grille, tuiles, chemin, spots
│  ├─ difficulty.ts les deux axes de difficulté
│  ├─ enemies.ts    ennemis · towers.ts   tours · farm.ts  bébés et bâtiments
│  ├─ resources.ts  les 4 ressources, coûts et escalade
│  └─ game.ts       orchestration : phases, économie, impacts
├─ render/      sprites procéduraux + moteur de rendu trié en profondeur
└─ ui/          HUD en DOM par-dessus le canvas

public/         manifeste PWA, service worker, icônes (copiés tels quels dans dist/)
scripts/        génération des icônes (pur Node, sans dépendance)
resources/      icône et écran de démarrage source pour les stores
android/ ios/   projets natifs Capacitor, versionnés (cf. MOBILE.md)
```

`src/game/` ne connaît ni le canvas ni le DOM : c'est ce qui permet de le faire tourner
en headless pour tester l'équilibrage.

## Mode 1 vs 1 en ligne

Face à face sur une carte unique : **deux chemins**, un par joueur, dans la zone
défense centrale. Vous voyez tout de l'adversaire — sa ferme, ses tours, ses ennemis,
et votre armée en train de le frapper.

Pendant chaque répit vous achetez des unités (nourriture + or) dans le panneau
« Armée ». Au lancement de la vague, elles arrivent sur **son** chemin, marquées d'un
fanion bleu. Le contre-jeu est intégré : il touche les âmes et l'or de tout ce qu'il
tue, donc sur-envoyer finance ses upgrades. Si vous ne préparez rien, rien ne part.

Les vagues scénarisées continuent d'arriver sur les deux joueurs à l'identique : elles
garantissent qu'une partie se termine même si personne n'attaque, et se décide alors
aux vies restantes.

### Architecture réseau

**Chaque joueur reste autoritaire sur son propre côté** et publie 4 fois par seconde
une photo de son plateau ([`src/net/snapshot.ts`](src/net/snapshot.ts)). L'autre
l'affiche en interpolant entre les deux dernières photos, avec un retard d'une période
pour toujours disposer de deux bornes valides.

C'est le compromis retenu face au lockstep : aucune contrainte de déterminisme sur le
moteur, aucun risque de divergence silencieuse, au prix d'un rendu adverse interpolé
plutôt qu'exact — invisible à la vitesse de jeu du titre.

Contrepartie assumée : un client modifié peut tricher. Sans intérêt pour une partie
entre deux personnes qui se connaissent.

Le serveur ([`server/serveur.mjs`](server/serveur.mjs)) ne simule rien et ne lit même
pas le contenu des plateaux — il apparie, gère les « prêt » et relaie. Il est couvert
par un test d'intégration de 22 assertions qui fait dialoguer deux clients sur tout le
cycle : salon, réglages réservés à l'hôte, refus de démarrer à un seul joueur prêt,
relais d'armée et d'instantané, fin de partie et déconnexion en cours de partie.

La vitesse de jeu est **verrouillée à ×1 en duel** : accélérer chez soi décalerait les
vagues et rendrait les envois incohérents.

## Mobile, PWA et stores

Rien à installer côté joueur : le site est déjà jouable au doigt. Pour aller plus loin :

```bash
npm run icones        # (re)génère les icônes du jeu et des stores
npm run mobile:sync   # build web + copie dans les projets Android/iOS
npm run mobile:android  # ouvre le projet dans Android Studio
npm run mobile:ios      # ouvre le projet dans Xcode (macOS)
npm run apk             # APK de test installable (SDK Android requis)
npm run apk:release     # APK signé, si android/keystore.properties existe
```

- **PWA** : `public/manifest.webmanifest` + `public/sw.js`. Une fois « ajouté à l'écran
  d'accueil », le jeu démarre en plein écran et le solo fonctionne hors ligne.
- **Apps natives** : `android/` et `ios/` sont des projets [Capacitor](https://capacitorjs.com)
  versionnés qui embarquent le build web. Ils n'ont pas de code de jeu propre : tout
  correctif du jeu part du même `src/`.
- **1 vs 1 depuis l'app** : la page vient du téléphone, pas d'un serveur. L'URL du salon
  est fixée au build par `VITE_SERVEUR_WS` (cf. [`.env.example`](.env.example)).
- **Sans rien installer** : le workflow [APK Android](.github/workflows/apk.yml) compile
  l'APK sur les runners GitHub à chaque push, et le dépose en artefact téléchargeable.

La marche à suivre complète — signature, versions, pièces à fournir au Play Store et à
l'App Store — est dans [MOBILE.md](MOBILE.md).

## Héberger

### Avec Docker et Traefik (déploiement de référence)

```bash
docker compose up -d --build
```

Le [`Dockerfile`](Dockerfile) est en deux étapes : la première installe tout et lance
`npm run build` — donc **une image ne se construit pas si le TypeScript ne compile
pas** — la seconde ne garde que `dist/`, `server/` et `ws`. L'image finale tourne sous
l'utilisateur `node`, sans devDependencies.

Le [`docker-compose.yml`](docker-compose.yml) branche le conteneur sur le réseau
`traefik` externe, sans publier de port sur l'hôte. **Traefik gère l'upgrade WebSocket
nativement** : le jeu et le 1 vs 1 passent par le même routeur, aucun middleware à
ajouter. Pour changer de domaine, une seule ligne :

```yaml
- "traefik.http.routers.game.rule=Host(`game.exemple.fr`)"
```

### Sans Docker

```bash
npm ci
npm run build            # produit dist/
PORT=8080 npm start      # sert dist/ ET le 1 vs 1 sur le même port
```

**Un seul port, une seule origine.** Le serveur sert les fichiers statiques en HTTP et
accepte l'upgrade WebSocket sur `/ws` ; le client vise toujours `/ws` sur l'origine de
la page. Trois problèmes disparaissent d'un coup : plus de second port à ouvrir dans le
pare-feu, plus d'URL de serveur à saisir, et surtout plus de blocage « contenu mixte » —
une page en `https` refuse une socket en clair, or un port WebSocket séparé n'a
généralement pas de certificat.

En développement, Vite relaie `/ws` vers `localhost:8080`, donc le même code marche des
deux côtés sans cas particulier.

### Derrière un reverse proxy

Le seul point d'attention est de laisser passer l'upgrade. Avec Caddy, c'est
automatique — et le HTTPS aussi :

```
jeu.mondomaine.fr {
    reverse_proxy localhost:8080
}
```

Avec nginx, il faut le dire explicitement, sinon la connexion 1 vs 1 échoue en
silence pendant que le jeu s'affiche parfaitement :

```nginx
location / {
    proxy_pass http://localhost:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;   # sinon la socket meurt pendant une partie
}
```

### En service systemd

```ini
[Unit]
Description=Nations Defense
After=network.target

[Service]
WorkingDirectory=/opt/nations-defense
Environment=PORT=8080
ExecStart=/usr/bin/node server/serveur.mjs
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

Le serveur garde les salons **en mémoire** : un redémarrage coupe les parties en cours.
C'est voulu — il n'y a rien à persister pour un jeu qui se joue en 20 minutes.

## Prochaines étapes (d'après le document de design)

1. **Héros mythologiques** déplaçables (Griffon, Qilin) avec pouvoirs à cooldown.
2. **Bâtiments animaux** (Nid Coq, Perchoir Aigle) et recherches débloquant les
   upgrades de tours — le pont manquant entre la ferme et la défense.
3. **Les 10 autres pays** : tours, bébés et bâtiments nationaux.
4. **Passage à 50 vagues** avec boss aux vagues 10 / 20 / 30 / 50, et les types
   d'ennemis manquants (Slime Puddles, Ghosties Ninjas, Pixie Raiders).
5. **Raids sur la ferme** à partir de l'Âge 3, prévus par le document de design.
