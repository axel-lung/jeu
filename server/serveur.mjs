/**
 * Serveur de Nations Defense : sert le jeu (dist/) et relaie le 1 vs 1.
 *
 * Il ne simule rien : chaque client est autoritaire sur son propre plateau. Le
 * serveur ne fait que trois choses — apparier deux joueurs dans un salon, gérer
 * le « prêt » des deux côtés, et relayer les armées et les instantanés.
 *
 * Tout passe par **un seul port** : les fichiers statiques en HTTP, le 1 vs 1
 * sur la même origine via une requête d'upgrade. C'est ce qui permet de le
 * mettre derrière n'importe quel reverse proxy en HTTPS sans configuration
 * supplémentaire — et d'éviter le blocage « contenu mixte » qu'un port
 * WebSocket séparé en clair provoquerait sur une page servie en https.
 *
 *   node server/serveur.mjs [port]     (ou PORT=… node server/serveur.mjs)
 */

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8080);
const HOTE = process.env.HOST ?? '0.0.0.0';
const RACINE = resolve(fileURLToPath(new URL('../dist', import.meta.url)));

/** @type {Map<string, {code: string, joueurs: Array<any>, reglages: any, enPartie: boolean}>} */
const salons = new Map();

const REGLAGES_DEFAUT = { ferme: 'normale', carte: 'equilibree', graine: 1 };

function envoyer(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function diffuser(salon, message, sauf = null) {
  for (const j of salon.joueurs) if (j.ws !== sauf) envoyer(j.ws, message);
}

function etatSalon(salon) {
  return salon.joueurs.map((j, i) => ({ pseudo: j.pseudo, pret: j.pret, place: i }));
}

function pousserSalon(salon) {
  const joueurs = etatSalon(salon);
  for (const [i, j] of salon.joueurs.entries()) {
    envoyer(j.ws, { t: 'salon', joueurs, maPlace: i, code: salon.code });
  }
}

function adversaireDe(salon, ws) {
  return salon.joueurs.find((j) => j.ws !== ws) ?? null;
}

function quitter(ws) {
  const salon = ws._salon;
  if (!salon) return;
  salon.joueurs = salon.joueurs.filter((j) => j.ws !== ws);
  ws._salon = null;

  if (salon.joueurs.length === 0) {
    salons.delete(salon.code);
    return;
  }
  // Il reste quelqu'un : on le prévient et on le remet en attente.
  if (salon.enPartie) {
    salon.enPartie = false;
    diffuser(salon, { t: 'fin', victoire: true, raison: 'L’adversaire a quitté la partie.' });
  } else {
    diffuser(salon, { t: 'adversaireParti' });
  }
  for (const j of salon.joueurs) j.pret = false;
  pousserSalon(salon);
}

function tenterDemarrage(salon) {
  if (salon.enPartie) return;
  if (salon.joueurs.length !== 2) return;
  if (!salon.joueurs.every((j) => j.pret)) return;

  salon.enPartie = true;
  // Une graine tirée au démarrage : les deux joueurs ont des cartes différentes
  // (chacun la sienne), mais issues des mêmes réglages de difficulté.
  const reglages = { ...salon.reglages };
  diffuser(salon, { t: 'demarrer', reglages });
}

/* ---------------- Fichiers statiques ---------------- */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Chemin sur disque correspondant à l'URL, ou null s'il sort de dist/. */
function resoudre(url) {
  const brut = decodeURIComponent(new URL(url, 'http://x').pathname);
  const cible = resolve(join(RACINE, normalize(brut)));
  if (cible !== RACINE && !cible.startsWith(RACINE + sep)) return null;
  try {
    return statSync(cible).isDirectory() ? join(cible, 'index.html') : cible;
  } catch {
    return null;
  }
}

function servir(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }
  // Tout ce qui n'existe pas retombe sur index.html : le jeu est une page unique.
  const fichier = resoudre(req.url ?? '/') ?? join(RACINE, 'index.html');
  let taille;
  try {
    taille = statSync(fichier).size;
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Jeu introuvable. Avez-vous lancé « npm run build » ?\n');
    return;
  }
  // Les noms des assets contiennent un hash de contenu : ils ne changent jamais.
  // index.html, lui, doit être revalidé sinon un déploiement passe inaperçu.
  const immuable = fichier.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    'content-type': TYPES[extname(fichier)] ?? 'application/octet-stream',
    'content-length': taille,
    'cache-control': immuable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(fichier).on('error', () => res.destroy()).pipe(res);
}

/* ---------------- Salons ---------------- */

const http = createServer(servir);
const wss = new WebSocketServer({ server: http });

wss.on('connection', (ws) => {
  ws._salon = null;
  ws.on('message', (brut) => {
    let m;
    try {
      m = JSON.parse(String(brut));
    } catch {
      return;
    }

    if (m.t === 'rejoindre') {
      const code = String(m.salon || '').trim().toUpperCase() || 'PUBLIC';
      let salon = salons.get(code);
      if (!salon) {
        salon = { code, joueurs: [], reglages: { ...REGLAGES_DEFAUT }, enPartie: false };
        salons.set(code, salon);
      }
      if (salon.joueurs.length >= 2) {
        envoyer(ws, { t: 'erreur', message: `Le salon ${code} est déjà complet.` });
        return;
      }
      quitter(ws);
      ws._salon = salon;
      salon.joueurs.push({ ws, pseudo: String(m.pseudo || 'Joueur').slice(0, 16), pret: false });
      // `salon` d'abord : le client doit connaître sa place avant de recevoir les
      // réglages, sinon l'invité se croit encore hôte et les ignore.
      pousserSalon(salon);
      envoyer(ws, { t: 'reglages', reglages: salon.reglages });
      return;
    }

    const salon = ws._salon;
    if (!salon) return;
    const moi = salon.joueurs.find((j) => j.ws === ws);
    if (!moi) return;

    switch (m.t) {
      case 'reglages': {
        // Seul l'hôte (place 0) fixe les réglages, pour éviter les allers-retours.
        if (salon.joueurs[0]?.ws !== ws) return;
        salon.reglages = m.reglages;
        // Changer les réglages annule les « prêt » : on ne démarre pas sur un malentendu.
        for (const j of salon.joueurs) j.pret = false;
        diffuser(salon, { t: 'reglages', reglages: salon.reglages });
        pousserSalon(salon);
        return;
      }
      case 'pret': {
        moi.pret = !!m.pret;
        pousserSalon(salon);
        tenterDemarrage(salon);
        return;
      }
      case 'armee': {
        const adv = adversaireDe(salon, ws);
        if (adv && Array.isArray(m.unites) && m.unites.length) {
          envoyer(adv.ws, { t: 'armee', unites: m.unites.slice(0, 200) });
        }
        return;
      }
      case 'instantane': {
        // Relais tel quel : le serveur ne lit pas le contenu des plateaux.
        const adv = adversaireDe(salon, ws);
        if (adv && m.s) envoyer(adv.ws, { t: 'instantane', s: m.s });
        return;
      }
      case 'termine': {
        if (!salon.enPartie) return;
        salon.enPartie = false;
        const adv = adversaireDe(salon, ws);
        // Celui qui annonce sa défaite fait gagner l'autre, et inversement.
        envoyer(ws, {
          t: 'fin',
          victoire: m.victoire,
          raison: m.victoire ? 'Vous avez tenu les 10 vagues.' : 'Votre village est tombé.',
        });
        if (adv) {
          envoyer(adv.ws, {
            t: 'fin',
            victoire: !m.victoire,
            raison: m.victoire
              ? 'L’adversaire a tenu les 10 vagues avant vous.'
              : 'Le village adverse est tombé.',
          });
        }
        for (const j of salon.joueurs) j.pret = false;
        pousserSalon(salon);
        return;
      }
      default:
        return;
    }
  });

  ws.on('close', () => quitter(ws));
  ws.on('error', () => quitter(ws));
});

http.listen(PORT, HOTE, () => {
  console.log(`Nations Defense écoute sur http://${HOTE}:${PORT} (jeu + 1 vs 1)`);
});
