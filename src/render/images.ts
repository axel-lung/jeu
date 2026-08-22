/**
 * Les rares images bitmap du jeu.
 *
 * Tout le reste est dessiné à la main en Canvas 2D (cf. `sprites.ts`) ; seul le
 * Coq Gaulois vient d'une planche de sprites découpée par
 * `scripts/extraire-coq.mjs`. Les fichiers passent par un `import`, donc Vite
 * leur donne un nom haché et le service worker peut les mettre en cache
 * définitivement.
 *
 * Le chargement démarre à l'import du module, soit bien avant la première
 * partie. En attendant, `image()` rend `null` et l'appelant se contente de ne
 * rien dessiner — c'est l'affaire de quelques millisecondes au démarrage.
 */

import urlCoqRepos from '../assets/coq/repos.png';
import urlCoqAttaque from '../assets/coq/attaque.png';

const SOURCES = {
  coqRepos: urlCoqRepos,
  coqAttaque: urlCoqAttaque,
} as const;

export type NomImage = keyof typeof SOURCES;

const chargees = new Map<NomImage, HTMLImageElement>();
const abonnes = new Set<() => void>();
let restantes = Object.keys(SOURCES).length;

function terminer(): void {
  if (--restantes > 0) return;
  for (const rappel of abonnes) rappel();
  abonnes.clear();
}

for (const [nom, url] of Object.entries(SOURCES) as [NomImage, string][]) {
  const img = new Image();
  img.decoding = 'async';
  img.addEventListener('load', () => {
    chargees.set(nom, img);
    terminer();
  });
  // Un fichier manquant ne doit pas figer les abonnés en attente : on décompte
  // quand même, le sprite sera simplement absent.
  img.addEventListener('error', terminer);
  img.src = url;
}

/** L'image si elle est prête, `null` sinon. */
export function image(nom: NomImage): HTMLImageElement | null {
  return chargees.get(nom) ?? null;
}

/**
 * Appelle `rappel` une fois toutes les images chargées (immédiatement si c'est
 * déjà le cas). Sert aux dessins qui n'ont lieu qu'une fois, comme les
 * miniatures des cartes de la boutique.
 */
export function quandImagesPretes(rappel: () => void): void {
  if (restantes === 0) rappel();
  else abonnes.add(rappel);
}
