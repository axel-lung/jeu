/**
 * Découpe la planche du Coq Gaulois en vignettes détourées pour le jeu.
 *
 *   node scripts/extraire-coq.mjs          # les 2 vignettes utilisées par le jeu
 *   node scripts/extraire-coq.mjs --tout   # + les 20 poses de la planche, pour explorer
 *
 * La planche source (`resources/sprites/coq-gaulois-planche.png`) est un RVB sans
 * canal alpha : le « damier de transparence » y est peint en dur. Le détourage se
 * fait donc ici, en deux temps — remplissage depuis les bords, puis nettoyage des
 * poches de damier enfermées par le trait (entre la lance et le corps, par exemple).
 *
 * Comme `generer-icones.mjs`, ce script n'utilise que `node:zlib` : le dépôt reste
 * sans dépendance graphique, et les vignettes sont reproductibles.
 */

import { deflateSync, inflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(RACINE, 'resources/sprites/coq-gaulois-planche.png');
const DESTINATION = join(RACINE, 'src/assets/coq');

/* ------------------------------------------------------------------ */
/*  PNG : décodage et encodage                                         */
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

function encoderPng(largeur, hauteur, rgba) {
  const brut = Buffer.alloc((largeur * 4 + 1) * hauteur);
  for (let y = 0; y < hauteur; y++) {
    const dep = y * (largeur * 4 + 1);
    brut[dep] = 0;
    rgba.copy(brut, dep + 1, y * largeur * 4, (y + 1) * largeur * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', ihdr),
    morceau('IDAT', deflateSync(brut, { level: 9 })),
    morceau('IEND', Buffer.alloc(0)),
  ]);
}

/** Décode un PNG 8 bits RVB ou RVBA non entrelacé. */
function decoderPng(buf) {
  let pos = 8;
  let largeur = 0;
  let hauteur = 0;
  let canaux = 0;
  const idat = [];

  while (pos < buf.length) {
    const taille = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const donnees = buf.subarray(pos + 8, pos + 8 + taille);
    if (type === 'IHDR') {
      largeur = donnees.readUInt32BE(0);
      hauteur = donnees.readUInt32BE(4);
      if (donnees[8] !== 8 || (donnees[9] !== 2 && donnees[9] !== 6)) {
        throw new Error(`PNG non géré : profondeur ${donnees[8]}, type couleur ${donnees[9]}`);
      }
      canaux = donnees[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(donnees));
    } else if (type === 'IEND') break;
    pos += 12 + taille;
  }

  const brut = inflateSync(Buffer.concat(idat));
  const octetsLigne = largeur * canaux;
  const px = Buffer.alloc(largeur * hauteur * 4);
  let precedente = Buffer.alloc(octetsLigne);

  for (let y = 0; y < hauteur; y++) {
    const filtre = brut[y * (octetsLigne + 1)];
    const src = brut.subarray(y * (octetsLigne + 1) + 1, (y + 1) * (octetsLigne + 1));
    const ligne = Buffer.alloc(octetsLigne);
    for (let i = 0; i < octetsLigne; i++) {
      const a = i >= canaux ? ligne[i - canaux] : 0;
      const b = precedente[i];
      const c = i >= canaux ? precedente[i - canaux] : 0;
      let v = src[i];
      // Les 5 filtres du format PNG : aucun, gauche, haut, moyenne, Paeth.
      if (filtre === 1) v += a;
      else if (filtre === 2) v += b;
      else if (filtre === 3) v += (a + b) >> 1;
      else if (filtre === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      ligne[i] = v & 0xff;
    }
    for (let x = 0; x < largeur; x++) {
      const s = x * canaux;
      const d = (y * largeur + x) * 4;
      px[d] = ligne[s];
      px[d + 1] = ligne[s + 1];
      px[d + 2] = ligne[s + 2];
      px[d + 3] = canaux === 4 ? ligne[s + 3] : 255;
    }
    precedente = ligne;
  }
  return { largeur, hauteur, px };
}

/* ------------------------------------------------------------------ */
/*  Détourage                                                          */
/* ------------------------------------------------------------------ */

/** Les deux gris du damier de transparence, et la tolérance de comparaison. */
const TONS_DAMIER = [239, 254];
const TOLERANCE = 9;

/** Gris neutre suffisamment clair pour appartenir au halo du dessin. */
const SEUIL_HALO = 195;
/**
 * Épaisseur maximale, en pixels, du halo rongé autour du personnage. La borne
 * est ce qui protège l'argent du casque : le grignotage part du fond et ne peut
 * pas atteindre le milieu du dessin, même si un pixel clair fait la jonction.
 */
const EPAISSEUR_HALO = 4;

/** Vrai si le pixel est un gris neutre proche d'un des deux tons du damier. */
function estDamier(px, i) {
  const r = px[i];
  const v = px[i + 1];
  const b = px[i + 2];
  if (Math.abs(r - v) > 5 || Math.abs(v - b) > 5 || Math.abs(r - b) > 5) return false;
  return TONS_DAMIER.some((t) => Math.abs(r - t) <= TOLERANCE);
}

/** Vrai si le pixel est un gris neutre clair, candidat au halo. */
function estHalo(px, i) {
  const r = px[i];
  const v = px[i + 1];
  const b = px[i + 2];
  if (Math.max(r, v, b) - Math.min(r, v, b) > 12) return false;
  return (r + v + b) / 3 >= SEUIL_HALO;
}

/** Découpe une vignette de la planche, efface le damier, rogne au contenu. */
function decouper(planche, x0, y0, x1, y1) {
  const w = x1 - x0;
  const h = y1 - y0;
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((y0 + y) * planche.largeur + x0) * 4;
    planche.px.copy(px, y * w * 4, src, src + w * 4);
  }

  const damier = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) damier[p] = estDamier(px, p * 4) ? 1 : 0;

  // 1) Remplissage depuis les quatre bords : le damier qui entoure le personnage.
  //    La connexité est essentielle — un aplat blanc *à l'intérieur* du dessin
  //    n'est jamais atteint, puisque le trait noir ferme les contours.
  const aEffacer = new Uint8Array(w * h);
  const pile = [];
  for (let x = 0; x < w; x++) pile.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) pile.push(y * w, y * w + w - 1);
  while (pile.length) {
    const p = pile.pop();
    if (aEffacer[p] || !damier[p]) continue;
    aEffacer[p] = 1;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) pile.push(p - 1);
    if (x < w - 1) pile.push(p + 1);
    if (y > 0) pile.push(p - w);
    if (y < h - 1) pile.push(p + w);
  }

  // 2) Poches enfermées par le trait. On n'efface que celles qui contiennent les
  //    *deux* tons du damier : un aplat clair du dessin n'en contient qu'un seul.
  const vue = new Uint8Array(w * h);
  for (let depart = 0; depart < w * h; depart++) {
    if (!damier[depart] || aEffacer[depart] || vue[depart]) continue;
    const membres = [];
    let clairs = 0;
    let sombres = 0;
    const f = [depart];
    vue[depart] = 1;
    while (f.length) {
      const p = f.pop();
      membres.push(p);
      if (Math.abs(px[p * 4] - TONS_DAMIER[1]) <= TOLERANCE) clairs++;
      else sombres++;
      const x = p % w;
      const y = (p / w) | 0;
      const voisins = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of voisins) {
        if (q >= 0 && damier[q] && !vue[q]) {
          vue[q] = 1;
          f.push(q);
        }
      }
    }
    const melange = Math.min(clairs, sombres) / membres.length;
    if (membres.length > 60 && melange > 0.12) for (const p of membres) aEffacer[p] = 1;
  }

  // 3) L'illustration entoure le personnage d'un halo blanc : sur l'herbe du jeu
  //    il ressortirait comme un liseré pâle. On le ronge depuis le fond, sur
  //    quelques pixels seulement, ce qui laisse intacts les gris du casque.
  for (let passe = 0; passe < EPAISSEUR_HALO; passe++) {
    const ajouts = [];
    for (let p = 0; p < w * h; p++) {
      if (aEffacer[p] || !estHalo(px, p * 4)) continue;
      const x = p % w;
      const y = (p / w) | 0;
      const voisinFond =
        (x > 0 && aEffacer[p - 1]) ||
        (x < w - 1 && aEffacer[p + 1]) ||
        (y > 0 && aEffacer[p - w]) ||
        (y < h - 1 && aEffacer[p + w]);
      if (voisinFond) ajouts.push(p);
    }
    if (ajouts.length === 0) break;
    for (const p of ajouts) aEffacer[p] = 1;
  }

  for (let p = 0; p < w * h; p++) if (aEffacer[p]) px[p * 4 + 3] = 0;

  // La boîte du contenu est renvoyée sans être appliquée : les vignettes du jeu
  // sont recadrées ensemble, sur leur boîte commune (cf. `recadrer`).
  let ax = w;
  let ay = h;
  let bx = 0;
  let by = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 8) {
        if (x < ax) ax = x;
        if (x > bx) bx = x;
        if (y < ay) ay = y;
        if (y > by) by = y;
      }
    }
  }
  return { largeur: w, hauteur: h, px, boite: { ax, ay, bx, by } };
}

/** Découpe une image déjà détourée sur la boîte donnée, avec 2 px de marge. */
function recadrer(vignette, boite) {
  const { largeur: w, px } = vignette;
  const ax = Math.max(0, boite.ax - 2);
  const ay = Math.max(0, boite.ay - 2);
  const bx = Math.min(w - 1, boite.bx + 2);
  const by = Math.min(vignette.hauteur - 1, boite.by + 2);
  const cw = bx - ax + 1;
  const ch = by - ay + 1;
  const sortie = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const src = ((ay + y) * w + ax) * 4;
    px.copy(sortie, y * cw * 4, src, src + cw * 4);
  }
  return { largeur: cw, hauteur: ch, px: sortie };
}

/** Boîte englobant plusieurs boîtes de contenu. */
function union(boites) {
  return {
    ax: Math.min(...boites.map((b) => b.ax)),
    ay: Math.min(...boites.map((b) => b.ay)),
    bx: Math.max(...boites.map((b) => b.bx)),
    by: Math.max(...boites.map((b) => b.by)),
  };
}

/* ------------------------------------------------------------------ */
/*  Géométrie de la planche                                            */
/* ------------------------------------------------------------------ */

// Centres des colonnes, relevés sur les étiquettes FRONT / RIGHT / BACK / LEFT.
const COLONNES = { face: 616, droite: 787, dos: 958, gauche: 1132 };
// Centres des lignes, relevés sur les étiquettes IDLE / WALK / ATTACK / HURT / DEATH.
const LIGNES = { repos: 199, marche: 405, attaque: 614, touche: 832, mort: 1029 };
const DEMI_LARGEUR = 85;
const DEMI_HAUTEUR = 100;

/**
 * Ce que le jeu utilise. La tour est fixe et ne fait que se retourner : deux
 * poses suffisent, le rendu miroite pour l'autre sens.
 *
 * Les deux viennent de la colonne FRONT parce que c'est la seule dont l'attaque
 * frappe vers la droite — le sens canonique du sprite dans le jeu. Les colonnes
 * RIGHT et LEFT de la planche, elles, sont quasi identiques entre elles.
 */
const VIGNETTES_DU_JEU = [
  { nom: 'repos', ligne: 'repos', colonne: 'face' },
  { nom: 'attaque', ligne: 'attaque', colonne: 'face' },
];

const planche = decoderPng(readFileSync(SOURCE));
mkdirSync(DESTINATION, { recursive: true });

function ecrire(nom, vignette) {
  const png = encoderPng(vignette.largeur, vignette.hauteur, vignette.px);
  writeFileSync(join(DESTINATION, `${nom}.png`), png);
  console.log(
    `  ${nom}.png — ${vignette.largeur}x${vignette.hauteur}, ${(png.length / 1024).toFixed(1)} ko`,
  );
}

function vignette(ligne, colonne) {
  const cx = COLONNES[colonne];
  const cy = LIGNES[ligne];
  return decouper(planche, cx - DEMI_LARGEUR, cy - DEMI_HAUTEUR, cx + DEMI_LARGEUR, cy + DEMI_HAUTEUR);
}

console.log(`Planche ${planche.largeur}x${planche.hauteur} → ${DESTINATION.replace(`${RACINE}/`, '')}`);

// Les deux poses sont recadrées sur *la même* boîte : sans ça, la vignette
// d'attaque — plus ramassée — serait étirée à la même hauteur que celle de
// repos, et le coq changerait de taille à chaque tir.
const poses = VIGNETTES_DU_JEU.map((v) => ({ ...v, image: vignette(v.ligne, v.colonne) }));
const commune = union(poses.map((p) => p.image.boite));
for (const p of poses) ecrire(p.nom, recadrer(p.image, commune));

if (process.argv.includes('--tout')) {
  console.log('Toutes les poses (exploration, non versionnées) :');
  for (const ligne of Object.keys(LIGNES)) {
    for (const colonne of Object.keys(COLONNES)) {
      const v = vignette(ligne, colonne);
      ecrire(`planche-${ligne}-${colonne}`, recadrer(v, v.boite));
    }
  }
}
