import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Empaquetage du jeu en application Android / iOS.
 *
 * Capacitor embarque le build web (`dist/`) dans une WebView plein écran : le
 * moteur du jeu est exactement celui du site, il n'y a pas de seconde base de
 * code à maintenir. Le cycle est `npm run mobile:sync` après chaque changement,
 * puis Android Studio ou Xcode pour produire l'AAB / l'IPA à envoyer aux stores.
 *
 * Détail important pour le 1 vs 1 : la page est servie depuis le téléphone
 * (`https://localhost`), pas depuis le serveur. L'URL du salon vient donc de
 * `VITE_SERVEUR_WS` au moment du build (cf. `.env.example`).
 */
const config: CapacitorConfig = {
  appId: 'fr.alng.nationsdefense',
  appName: 'Nations Defense',
  webDir: 'dist',

  // Le jeu occupe tout l'écran, y compris sous l'encoche : les marges sont
  // gérées en CSS par les `safe-area-inset-*`.
  android: {
    backgroundColor: '#0e1420',
    // Le zoom se fait au pincement dans le canvas, pas par la WebView.
    webContentsDebuggingEnabled: false,
  },
  ios: {
    backgroundColor: '#0e1420',
    contentInset: 'never',
    scrollEnabled: false,
  },

  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 900,
      backgroundColor: '#0e1420',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
