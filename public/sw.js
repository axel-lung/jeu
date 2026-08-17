/**
 * Service worker de Nations Defense.
 *
 * Objectif : que le jeu se lance hors ligne une fois qu'il a été ouvert une
 * fois, et qu'il démarre instantanément le reste du temps. Il n'y a rien à
 * synchroniser — le solo est entièrement local, et le 1 vs 1 passe par une
 * WebSocket qui, elle, n'est jamais mise en cache.
 *
 * Stratégie :
 *   - navigation (la page elle-même) : réseau d'abord, cache en secours, ce qui
 *     évite de servir un index.html périmé qui pointerait vers des assets supprimés ;
 *   - assets versionnés (/assets/…, hash dans le nom) : cache d'abord, ils sont immuables ;
 *   - reste des GET de même origine : cache d'abord puis rafraîchissement en tâche de fond.
 *
 * Bump `VERSION` à chaque déploiement qui doit purger l'ancien cache.
 */

const VERSION = 'nations-defense-v1';
const COQUILLE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icones/icone-192.png',
  '/icones/icone-512.png',
  '/icones/icone-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      // `addAll` échoue en bloc si une seule entrée manque : chaque fichier est
      // donc tenté séparément, un 404 sur une icône ne doit pas priver du cache.
      .then((cache) => Promise.all(COQUILLE.map((u) => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

function estImmuable(url) {
  return url.pathname.startsWith('/assets/');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Autre origine, ou la WebSocket du 1 vs 1 : on laisse passer sans toucher.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/ws')) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((rep) => {
          const copie = rep.clone();
          caches.open(VERSION).then((c) => c.put('/index.html', copie));
          return rep;
        })
        .catch(() => caches.match('/index.html').then((r) => r ?? Response.error())),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cachee) => {
      if (cachee && estImmuable(url)) return cachee;

      const reseau = fetch(req)
        .then((rep) => {
          if (rep.ok) {
            const copie = rep.clone();
            caches.open(VERSION).then((c) => c.put(req, copie));
          }
          return rep;
        })
        .catch(() => cachee ?? Response.error());

      // Hors ligne : la copie en cache répond tout de suite ; en ligne : elle
      // répond quand même, et la version fraîche remplace la copie pour la fois suivante.
      return cachee ?? reseau;
    }),
  );
});
