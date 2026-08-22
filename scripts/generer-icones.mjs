/**
 * Génère les icônes du jeu (PWA, iOS, stores) et l'écran de démarrage natif.
 *
 *   node scripts/generer-icones.mjs
 *
 * Tout est dessiné à la main dans un tampon RGBA puis encodé en PNG avec le
 * seul `node:zlib` : aucune dépendance graphique à installer, et le logo est
 * reproductible à n'importe quelle taille — les stores en réclament beaucoup.
 *
 * Le dessin reprend le motif du jeu : une tuile isométrique, une tour dessus,
 * un fanion. Les couleurs sont celles du thème (`src/style.css`).
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ */
/*  Encodage PNG                                                       */
/* ------------------------------------------------------------------ */

const TABLE_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const octet of buf) c = TABLE_CRC[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function morceau(type, donnees) {
  const entete = Buffer.alloc(8);
  entete.writeUInt32BE(donnees.length, 0);
  entete.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), donnees])), 0);
  return Buffer.concat([entete, donnees, crc]);
}

/** Encode un tampon RGBA (w × h × 4) en PNG 8 bits. */
function encoderPng(largeur, hauteur, rgba) {
  const brut = Buffer.alloc((largeur * 4 + 1) * hauteur);
  for (let y = 0; y < hauteur; y++) {
    const dep = y * (largeur * 4 + 1);
    brut[dep] = 0; // filtre « none » : le zlib fait le travail
    rgba.copy(brut, dep + 1, y * largeur * 4, (y + 1) * largeur * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', ihdr),
    morceau('IDAT', deflateSync(brut, { level: 9 })),
    morceau('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ */
/*  Mini-rastériseur                                                   */
/* ------------------------------------------------------------------ */

/**
 * Toile RGBA minimale. Les formes sont dessinées à `echantillons`× la taille
 * finale puis moyennées : c'est l'anticrénelage du pauvre, et il suffit
 * largement pour un logo.
 */
class Toile {
  constructor(taille, echantillons = 3) {
    this.taille = taille;
    this.ss = echantillons;
    this.n = taille * echantillons;
    this.px = Buffer.alloc(this.n * this.n * 4);
  }

  /** Mélange une couleur (r,g,b,a 0-255) sur le pixel (x, y) de la grille fine. */
  melanger(x, y, [r, g, b, a]) {
    if (x < 0 || y < 0 || x >= this.n || y >= this.n || a <= 0) return;
    const i = (y * this.n + x) * 4;
    const alpha = a / 255;
    const inv = 1 - alpha;
    this.px[i] = r * alpha + this.px[i] * inv;
    this.px[i + 1] = g * alpha + this.px[i + 1] * inv;
    this.px[i + 2] = b * alpha + this.px[i + 2] * inv;
    this.px[i + 3] = Math.min(255, a + this.px[i + 3] * inv);
  }

  /** Remplit tout avec un dégradé vertical entre deux couleurs. */
  degradeVertical(haut, bas) {
    for (let y = 0; y < this.n; y++) {
      const t = y / (this.n - 1);
      const c = [
        haut[0] + (bas[0] - haut[0]) * t,
        haut[1] + (bas[1] - haut[1]) * t,
        haut[2] + (bas[2] - haut[2]) * t,
        255,
      ];
      for (let x = 0; x < this.n; x++) this.melanger(x, y, c);
    }
  }

  /** Remplit un polygone donné en coordonnées unitaires (0-1), règle pair-impair. */
  polygone(points, couleur) {
    const pts = points.map(([x, y]) => [x * this.n, y * this.n]);
    let yMin = Infinity;
    let yMax = -Infinity;
    let xMin = Infinity;
    let xMax = -Infinity;
    for (const [x, y] of pts) {
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);
    }
    for (let y = Math.max(0, Math.floor(yMin)); y <= Math.min(this.n - 1, Math.ceil(yMax)); y++) {
      const cy = y + 0.5;
      for (let x = Math.max(0, Math.floor(xMin)); x <= Math.min(this.n - 1, Math.ceil(xMax)); x++) {
        const cx = x + 0.5;
        let dedans = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i];
          const [xj, yj] = pts[j];
          if (yi > cy !== yj > cy && cx < ((xj - xi) * (cy - yi)) / (yj - yi) + xi) dedans = !dedans;
        }
        if (dedans) this.melanger(x, y, couleur);
      }
    }
  }

  /** Disque plein, coordonnées et rayon unitaires. */
  disque(cx, cy, rayon, couleur) {
    const c = [cx * this.n, cy * this.n];
    const r = rayon * this.n;
    for (let y = Math.max(0, Math.floor(c[1] - r)); y <= Math.min(this.n - 1, c[1] + r); y++) {
      for (let x = Math.max(0, Math.floor(c[0] - r)); x <= Math.min(this.n - 1, c[0] + r); x++) {
        if (Math.hypot(x + 0.5 - c[0], y + 0.5 - c[1]) <= r) this.melanger(x, y, couleur);
      }
    }
  }

  rectangle(x0, y0, x1, y1, couleur) {
    this.polygone(
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
      couleur,
    );
  }

  /** Moyenne les sous-échantillons et rend le PNG de la taille demandée. */
  versPng() {
    const s = this.ss;
    const sortie = Buffer.alloc(this.taille * this.taille * 4);
    for (let y = 0; y < this.taille; y++) {
      for (let x = 0; x < this.taille; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let dy = 0; dy < s; dy++) {
          for (let dx = 0; dx < s; dx++) {
            const i = ((y * s + dy) * this.n + (x * s + dx)) * 4;
            r += this.px[i];
            g += this.px[i + 1];
            b += this.px[i + 2];
            a += this.px[i + 3];
          }
        }
        const n = s * s;
        const j = (y * this.taille + x) * 4;
        sortie[j] = Math.round(r / n);
        sortie[j + 1] = Math.round(g / n);
        sortie[j + 2] = Math.round(b / n);
        sortie[j + 3] = Math.round(a / n);
      }
    }
    return encoderPng(this.taille, this.taille, sortie);
  }
}

/* ------------------------------------------------------------------ */
/*  Le logo                                                            */
/* ------------------------------------------------------------------ */

const FOND_HAUT = [27, 39, 66];
const FOND_BAS = [10, 15, 26];
const HERBE = [63, 141, 90, 255];
const TERRE = [35, 84, 55, 255];
const PIERRE_CLAIRE = [255, 209, 102, 255];
const PIERRE_SOMBRE = [240, 138, 29, 255];
const OMBRE = [0, 0, 0, 70];
const DRAPEAU = [255, 123, 138, 255];
const FENETRE = [14, 20, 32, 255];

/**
 * Dessine le logo dans la toile. `echelle` réduit le motif autour du centre,
 * ce qui sert aux icônes « maskable » (Android rogne jusqu'à 20 % des bords).
 */
function dessinerLogo(toile, echelle = 1) {
  const p = (x, y) => [0.5 + (x - 0.5) * echelle, 0.5 + (y - 0.5) * echelle];

  // Tuile isométrique : losange 2:1, avec une tranche de terre en dessous.
  const cx = 0.5;
  const cy = 0.72;
  const dx = 0.38;
  const dy = 0.19;
  const ep = 0.075; // épaisseur de la tranche

  toile.polygone(
    [
      p(cx - dx, cy),
      p(cx, cy + dy),
      p(cx + dx, cy),
      p(cx + dx, cy + ep),
      p(cx, cy + dy + ep),
      p(cx - dx, cy + ep),
    ],
    TERRE,
  );
  toile.polygone([p(cx, cy - dy), p(cx + dx, cy), p(cx, cy + dy), p(cx - dx, cy)], HERBE);

  // Ombre portée de la tour sur la tuile.
  toile.polygone(
    [p(cx, cy - 0.06), p(cx + 0.2, cy + 0.04), p(cx, cy + 0.14), p(cx - 0.2, cy + 0.04)],
    OMBRE,
  );

  // Corps de la tour : trapèze, plus large en bas.
  const hautCorps = 0.34;
  const basCorps = 0.7;
  toile.polygone(
    [
      p(cx - 0.14, hautCorps),
      p(cx + 0.14, hautCorps),
      p(cx + 0.17, basCorps),
      p(cx - 0.17, basCorps),
    ],
    PIERRE_CLAIRE,
  );
  // Flanc droit assombri : c'est ce qui donne le volume en 2.5D.
  toile.polygone(
    [p(cx + 0.05, hautCorps), p(cx + 0.14, hautCorps), p(cx + 0.17, basCorps), p(cx + 0.06, basCorps)],
    PIERRE_SOMBRE,
  );

  // Créneaux.
  const hCren = 0.075;
  for (const decal of [-0.17, -0.045, 0.08]) {
    toile.rectangle(
      ...p(cx + decal, hautCorps - hCren),
      ...p(cx + decal + 0.09, hautCorps + 0.012),
      PIERRE_CLAIRE,
    );
  }

  // Meurtrière.
  toile.rectangle(...p(cx - 0.035, 0.45), ...p(cx + 0.035, 0.58), FENETRE);

  // Mât et fanion.
  toile.rectangle(...p(cx - 0.012, 0.1), ...p(cx + 0.012, 0.28), [220, 226, 242, 255]);
  toile.polygone([p(cx + 0.012, 0.11), p(cx + 0.2, 0.17), p(cx + 0.012, 0.23)], DRAPEAU);
}

/** Icône complète : fond + logo. */
function icone(taille, { echelle = 1, echantillons = 3 } = {}) {
  const toile = new Toile(taille, echantillons);
  toile.degradeVertical(FOND_HAUT, FOND_BAS);
  dessinerLogo(toile, echelle);
  return toile.versPng();
}

/** Écran de démarrage natif : logo centré, petit, sur le fond du jeu. */
function splash(taille) {
  const toile = new Toile(taille, 1);
  toile.degradeVertical(FOND_HAUT, FOND_BAS);
  dessinerLogo(toile, 0.3);
  return toile.versPng();
}

/* ------------------------------------------------------------------ */

function ecrire(chemin, donnees) {
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, donnees);
  console.log(`  ${chemin.replace(`${RACINE}/`, '')} — ${(donnees.length / 1024).toFixed(1)} ko`);
}

console.log('Icônes du jeu :');
for (const taille of [32, 180, 192, 512]) {
  ecrire(join(RACINE, `public/icones/icone-${taille}.png`), icone(taille));
}
// Android rogne les icônes adaptatives : le motif doit tenir dans les 80 % centraux.
ecrire(join(RACINE, 'public/icones/icone-maskable-512.png'), icone(512, { echelle: 0.62 }));

console.log('Sources pour les stores (npx @capacitor/assets generate) :');
ecrire(join(RACINE, 'resources/icon.png'), icone(1024, { echantillons: 2 }));
ecrire(join(RACINE, 'resources/splash.png'), splash(2732));
ecrire(join(RACINE, 'resources/splash-dark.png'), splash(2732));
