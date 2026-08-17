# Nations Defense sur mobile

Le jeu tourne au doigt sous trois formes, **avec le même code** — il n'y a pas de
version mobile séparée à maintenir :

| Forme | Ce que c'est | Pour qui |
| --- | --- | --- |
| Site web | `game.alng.fr` ouvert dans le navigateur du téléphone | tout le monde, sans installation |
| PWA | le même site « ajouté à l'écran d'accueil » : plein écran, icône, hors ligne | joueurs réguliers |
| App native | le build web empaqueté par [Capacitor](https://capacitorjs.com) dans un projet Android/iOS | Play Store et App Store |

---

## 1. Les commandes tactiles

| Geste | Effet |
| --- | --- |
| Tap | poser / sélectionner |
| Glisser (rien en main) | déplacer la caméra |
| Glisser (une tour en main) | viser ; on pose en **lâchant** |
| Pincer | zoomer / dézoomer |
| Appui long | annuler la sélection (l'équivalent du clic droit) |
| Boutons ronds à droite | zoom + / −, et annulation |

Un outil en main confisque le glisser à un doigt : c'est ce qui permet de viser la
case sous le doigt et d'ajuster avant de lâcher, au lieu de poser à l'aveugle sous
une pulpe qui masque la tuile. Pour déplacer la caméra dans cet état, on utilise
deux doigts, ou on annule d'abord avec le bouton ✕.

Le jeu se joue **en paysage** : en portrait, un bandeau invite à tourner l'appareil.
Au lancement d'une partie, le jeu demande le plein écran et verrouille l'orientation
quand la plateforme le permet (Android le fait, iOS refuse hors app native).

---

## 2. PWA : installer depuis le navigateur

Rien à faire, c'est déjà en place — `public/manifest.webmanifest` et `public/sw.js`
sont copiés tels quels dans `dist/` au build.

- **Android / Chrome** : menu ⋮ → « Installer l'application ».
- **iOS / Safari** : Partager → « Sur l'écran d'accueil ».

Une fois installé, le jeu démarre en plein écran, sans barre d'URL, et **fonctionne
hors ligne** en solo (le service worker garde la coquille et les assets). Le 1 vs 1
a évidemment besoin du réseau.

Après un déploiement, le service worker sert l'ancienne version jusqu'au
rechargement suivant. Si un changement doit être forcé chez tout le monde, incrémentez
`VERSION` en tête de `public/sw.js` : l'ancien cache est alors purgé à l'activation.

---

## 3. App native : le cycle de travail

### Prérequis

- **Android** : [Android Studio](https://developer.android.com/studio). Le projet cible
  l'API 36 et tourne à partir d'Android 7 (`minSdkVersion 24`, cf. `android/variables.gradle`).
- **iOS** : un Mac avec Xcode 16+ (les dépendances passent par Swift Package Manager,
  il n'y a plus de CocoaPods) et un compte Apple Developer (99 $/an).

Les deux projets natifs sont **déjà générés et versionnés** (`android/`, `ios/`) :
il n'y a pas de `cap add` à refaire, seulement à synchroniser.

### À chaque modification du jeu

```bash
npm run mobile:sync        # build web + copie dans android/ et ios/
npm run mobile:android     # idem + ouvre Android Studio
npm run mobile:ios         # idem + ouvre Xcode (macOS uniquement)
```

`mobile:sync` lance `npm run build`, donc le TypeScript est vérifié avant chaque
copie : on n'embarque jamais un bundle qui ne compile pas.

### Le 1 vs 1 depuis l'app

Dans l'app, la page vient du téléphone (`https://localhost`), pas d'un serveur : il
n'y a aucune origine vers laquelle se rabattre pour la WebSocket. L'URL par défaut du
salon vient donc de `VITE_SERVEUR_WS`, fixée **au moment du build** :

```bash
cp .env.example .env         # VITE_SERVEUR_WS=wss://game.alng.fr/ws
npm run mobile:sync
```

Sans ce fichier, le jeu retombe sur la constante `SERVEUR_PUBLIC` de
`src/net/client.ts`. Le champ « Serveur » du menu reste modifiable par le joueur.

### Icônes et écran de démarrage

```bash
npm run icones          # redessine public/icones/ et resources/ (aucune dépendance)
npm run mobile:assets   # décline resources/ vers android/ et ios/
```

`scripts/generer-icones.mjs` dessine le logo en pur Node : changez les couleurs ou la
forme dans `dessinerLogo()` et relancez les deux commandes.

---

## 4. Exporter un APK

Un APK s'installe directement sur un téléphone, sans passer par un store. C'est le
moyen le plus rapide de tester le jeu sur son propre appareil ou de l'envoyer à
quelqu'un.

### Prérequis, une seule fois

Il faut le **SDK Android** et un **JDK 21**. Le plus simple est d'installer
[Android Studio](https://developer.android.com/studio), qui apporte les deux : au
premier lancement, laissez l'assistant télécharger le SDK, puis fermez-le. Rien
d'autre à configurer — le projet contient déjà son wrapper Gradle.

Si vous préférez sans Android Studio : les
[command line tools](https://developer.android.com/studio#command-line-tools-only),
`sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"`, et
`ANDROID_HOME` pointant sur le dossier du SDK.

### APK de test (non signé pour le store, installable tout de suite)

```bash
npm run apk
```

Sortie : **`android/app/build/outputs/apk/debug/app-debug.apk`**.

Pour l'installer :

- **par câble** : `adb install -r android/app/build/outputs/apk/debug/app-debug.apk` ;
- **sans câble** : copiez le `.apk` sur le téléphone (mail, cloud, clé USB), ouvrez-le
  depuis le gestionnaire de fichiers et autorisez « installer des applications
  inconnues » pour l'application qui le lance.

Cet APK est signé avec la clé de debug d'Android. Il s'installe partout, mais ne peut
pas être publié sur un store, et il ne se met pas à jour par-dessus un APK de release.

### APK signé (distribution hors store)

1. Créez la clé, une seule fois — **sauvegardez-la**, la perdre interdit toute mise à
   jour de l'app chez ceux qui l'ont installée :
   ```bash
   keytool -genkey -v -keystore android/nations-defense.keystore \
     -alias nations -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Déclarez-la :
   ```bash
   cp android/keystore.properties.example android/keystore.properties
   # puis renseignez storePassword / keyPassword
   ```
   Ni la clé ni ce fichier ne sont versionnés (`android/.gitignore`).
3. Construisez :
   ```bash
   npm run apk:release
   ```
   Sortie : **`android/app/build/outputs/apk/release/app-release.apk`**.

Sans `keystore.properties`, la commande produit quand même un APK, mais **non signé** :
Android refusera de l'installer. C'est le seul piège de cette étape.

### Sous Windows

Les deux scripts npm utilisent `./gradlew`, qui marche dans Git Bash et WSL. En
PowerShell ou `cmd`, faites l'équivalent à la main :

```powershell
npm run mobile:sync
cd android
.\gradlew.bat assembleDebug
```

### À savoir

- Le premier build télécharge Gradle et les dépendances Android : comptez plusieurs
  minutes. Les suivants prennent quelques dizaines de secondes.
- Refaites `npm run apk` après **chaque** modification du jeu : l'APK embarque une
  copie figée du build web.
- Le Play Store, lui, ne prend pas d'APK mais un **AAB** — voir la section suivante.

---

## 5. Publier sur le Play Store

1. **Identité** : `appId` est `fr.alng.nationsdefense` (`capacitor.config.ts`). Il est
   définitif une fois l'app publiée — changez-le maintenant si besoin, puis
   `npx cap sync android`.
2. **Version** : dans `android/app/build.gradle`, incrémentez `versionCode` (entier,
   strictement croissant à chaque envoi) et `versionName` (ce que le joueur voit).
3. **Clé de signature** — à créer une seule fois, à **sauvegarder précieusement** :
   ```bash
   keytool -genkey -v -keystore nations-defense.keystore \
     -alias nations -keyalg RSA -keysize 2048 -validity 10000
   ```
   Perdre cette clé interdit toute mise à jour de l'app publiée. Ne la commitez pas.
4. **Bundle** : Android Studio → *Build* → *Generate Signed Bundle / APK* → *Android
   App Bundle*, en sélectionnant le keystore. Sortie :
   `android/app/build/outputs/bundle/release/app-release.aab`.
5. **Play Console** (25 $ une fois) : créez l'application, envoyez l'AAB en test
   interne, puis en production. À préparer : icône 512×512 (`public/icones/icone-512.png`),
   bannière 1024×500, au moins 2 captures d'écran en paysage, description, politique de
   confidentialité (obligatoire même sans collecte), et le questionnaire « sécurité des
   données » — le jeu ne collecte rien, le pseudo du 1 vs 1 ne quitte pas le salon.

## 6. Publier sur l'App Store

1. Ouvrez `ios/App/App.xcodeproj` (`npm run mobile:ios` s'en charge).
2. *Signing & Capabilities* : choisissez votre équipe ; le bundle identifier doit
   correspondre à l'`appId`.
3. Incrémentez *Version* et *Build*, puis *Product → Archive → Distribute App*.
4. App Store Connect : envoi vers TestFlight, puis soumission. Mêmes pièces qu'Android,
   plus des captures aux formats iPhone 6,7" et iPad 12,9" **en paysage**.

L'orientation est déjà verrouillée en paysage des deux côtés :
`android:screenOrientation="sensorLandscape"` dans `AndroidManifest.xml`, et
`UISupportedInterfaceOrientations` limité aux deux paysages dans `Info.plist`.

---

## 7. Points d'attention

- **Ne pas commiter** `.env`, le keystore Android (`android/*.keystore`,
  `android/keystore.properties`), ni les certificats iOS — ils sont déjà ignorés.
- `android/app/src/main/assets/public/` et `ios/App/App/public/` sont le build web
  copié : ils sont ignorés par git, `mobile:sync` les régénère.
- Le mode 1 vs 1 exige `wss://` (TLS) depuis l'app : une WebSocket en clair est
  refusée par les deux plateformes en configuration par défaut.
- Testez toujours sur un vrai appareil avant d'envoyer : l'émulateur ne reproduit ni
  la latence tactile, ni le pincement à deux doigts, ni les encoches.
