/**
 * Adaptations propres au mobile : plein écran, verrouillage en paysage,
 * neutralisation des gestes du navigateur et installation du service worker.
 *
 * Tout est « au mieux » : chaque API est absente ou refusée quelque part (iOS
 * ne verrouille pas l'orientation, le plein écran exige un geste utilisateur,
 * un service worker n'existe pas hors HTTPS). Rien ici ne doit jamais casser la
 * partie, donc chaque appel est isolé et son échec ignoré.
 */

/** Vrai sur un appareil dont le pointeur principal est un doigt. */
export function estTactile(): boolean {
  return (
    matchMedia('(pointer: coarse)').matches ||
    navigator.maxTouchPoints > 0 ||
    'ontouchstart' in window
  );
}

/**
 * Vrai sur un appareil qu'on tient dans la main : doigt, et pas de survol.
 * Un portable à écran tactile mais piloté à la souris répond `hover: hover` et
 * garde donc l'interface de bureau — c'est ce booléen, et non `estTactile`, qui
 * décide du HUD replié.
 */
export function estMobile(): boolean {
  return estTactile() && matchMedia('(hover: none)').matches;
}

/**
 * Vrai dans l'app empaquetée par Capacitor : la page vient du bundle embarqué,
 * pas d'un serveur. Le pont natif publie `Capacitor` sur `window` au démarrage.
 */
export function estAppNative(): boolean {
  return (
    location.protocol === 'capacitor:' || location.protocol === 'file:' || 'Capacitor' in window
  );
}

/** Vrai quand le jeu tourne installé (PWA sur l'écran d'accueil, ou app native). */
export function estInstalle(): boolean {
  return (
    matchMedia('(display-mode: fullscreen)').matches ||
    matchMedia('(display-mode: standalone)').matches ||
    // Safari iOS n'implémente pas `display-mode`, il expose ce booléen à la place.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

/**
 * Passe en plein écran paysage. À appeler depuis un geste utilisateur (le clic
 * sur « Lancer la partie ») : les navigateurs refusent les deux sinon.
 */
export function passerEnPaysage(): void {
  if (!estTactile()) return;

  const el = document.documentElement;
  const demande = el.requestFullscreen?.bind(el);
  const verrouiller = (): void => {
    // `lock` n'existe pas sur Safari iOS, d'où l'appel optionnel. Ailleurs il
    // n'est autorisé qu'en plein écran ou en mode installé ; si la promesse est
    // rejetée, le bandeau « tournez votre téléphone » prend le relais.
    screen.orientation?.lock?.('landscape').catch(() => {});
  };

  if (demande && !document.fullscreenElement) {
    demande().then(verrouiller, verrouiller);
  } else {
    verrouiller();
  }
}

/**
 * Coupe les gestes que le navigateur s'approprie et qui gêneraient le jeu :
 * double-tap qui zoome, pincement de page, menu contextuel de l'appui long,
 * tirer-pour-rafraîchir.
 */
export function neutraliserGestesNavigateur(): void {
  // Safari iOS ignore `touch-action` pour son pincement de page : il faut refuser
  // ses évènements propriétaires explicitement.
  for (const nom of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(nom, (e) => e.preventDefault());
  }

  // Double-tap zoom : deux taps rapprochés au même endroit.
  let dernierTap = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const maintenant = performance.now();
      if (maintenant - dernierTap < 300) e.preventDefault();
      dernierTap = maintenant;
    },
    { passive: false },
  );

  // Un pincement à deux doigts hors canvas (sur le HUD) ne doit pas zoomer la page.
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}

/**
 * Installe le service worker qui rend le jeu jouable hors ligne une fois chargé.
 * Uniquement en production : en développement il masquerait les rechargements de Vite.
 */
export function enregistrerServiceWorker(): void {
  // Inutile dans l'app native : les fichiers sont déjà sur l'appareil, et un
  // cache supplémentaire ne ferait que retenir une version périmée après mise à jour.
  if (estAppNative() || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Hors HTTPS (ou dans un webview qui l'interdit) : le jeu marche, sans le cache.
    });
  });
}
