/**
 * Génération procédurale de la carte.
 *
 * Le chemin est tiré sur un treillis grossier dont les nœuds sont espacés de 3
 * tuiles. C'est ce qui garantit qu'il ne se colle jamais à lui-même : deux
 * couloirs parallèles gardent toujours 2 tuiles libres entre eux, de quoi poser
 * des tours des deux côtés.
 *
 * En duel, la zone défense est coupée en deux bandes horizontales — la haute pour
 * le joueur A, la basse pour le joueur B. Chaque bande reçoit son propre tracé,
 * généré indépendamment avec la même fonction.
 */

import type { Vec2 } from '../core/iso';
import type { TypeRessource } from './resources';

export const PAS = 3;
/** Colonnes du treillis dans la zone défense. */
export const TREILLIS_COLS = 7;
/** Rangées du treillis dans une bande de défense (12 tuiles de haut). */
export const TREILLIS_ROWS = 4;

/** Où poser un tracé : l'étendue de la bande et le sens de la marche. */
export interface Bande {
  /** Colonne de tuile de l'entrée (côté adverse) et de la sortie (côté village). */
  xEntree: number;
  xSortie: number;
  /** Première rangée de tuiles de la bande. */
  y0: number;
}

interface Noeud {
  cx: number;
  cy: number;
}

const cle = (n: Noeud): number => n.cy * TREILLIS_COLS + n.cx;

function voisins(n: Noeud): Noeud[] {
  const out: Noeud[] = [];
  if (n.cx > 0) out.push({ cx: n.cx - 1, cy: n.cy });
  if (n.cx < TREILLIS_COLS - 1) out.push({ cx: n.cx + 1, cy: n.cy });
  if (n.cy > 0) out.push({ cx: n.cx, cy: n.cy - 1 });
  if (n.cy < TREILLIS_ROWS - 1) out.push({ cx: n.cx, cy: n.cy + 1 });
  return out;
}

function melanger<T>(rng: () => number, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

const manhattan = (a: Noeud, b: Noeud): number => Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);

/**
 * Cherche un chemin sans auto-intersection de longueur *exactement* `longueur`
 * segments, par DFS randomisé.
 *
 * Deux élagages rendent la recherche rapide malgré le nombre de combinaisons :
 * il faut qu'il reste assez de pas pour atteindre l'arrivée (`d <= restant`), et
 * que la parité colle (sur une grille, la longueur d'un chemin et la distance de
 * Manhattan ont toujours la même parité).
 */
function chercher(
  rng: () => number,
  depart: Noeud,
  arrivee: Noeud,
  longueur: number,
): Noeud[] | null {
  const visite = new Set<number>([cle(depart)]);
  const chemin: Noeud[] = [depart];
  let budget = 400000;

  const rec = (pos: Noeud, restant: number): boolean => {
    if (budget-- <= 0) return false;
    if (restant === 0) return pos.cx === arrivee.cx && pos.cy === arrivee.cy;

    const d = manhattan(pos, arrivee);
    if (d > restant || (restant - d) % 2 !== 0) return false;

    for (const v of melanger(rng, voisins(pos))) {
      if (visite.has(cle(v))) continue;
      // On ne traverse l'arrivée qu'au tout dernier pas, sinon le chemin s'y
      // bloque : le nœud devient visité et on ne peut plus y revenir.
      if (v.cx === arrivee.cx && v.cy === arrivee.cy && restant !== 1) continue;

      visite.add(cle(v));
      chemin.push(v);
      if (rec(v, restant - 1)) return true;
      visite.delete(cle(v));
      chemin.pop();
    }
    return false;
  };

  return rec(depart, longueur) ? chemin : null;
}

/** Fusionne les sommets alignés : trois points sur une même ligne n'en valent que deux. */
function simplifier(points: Vec2[]): Vec2[] {
  const out: Vec2[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const alignes = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (!alignes) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * Sommets du chemin d'une bande, de l'entrée (côté adverse) à la sortie (le village
 * du joueur, adossé à sa ferme).
 */
export function genererChemin(rng: () => number, segments: number, bande: Bande): Vec2[] {
  // L'entrée est du côté de l'adversaire : le treillis se parcourt donc dans le
  // sens qui va de l'entrée vers la sortie.
  const versLaGauche = bande.xSortie < bande.xEntree;
  const xLattice = (cx: number): number =>
    versLaGauche
      ? bande.xSortie + 1 + (TREILLIS_COLS - 1 - cx) * PAS
      : bande.xSortie - 1 - (TREILLIS_COLS - 1 - cx) * PAS;
  const versTuile = (n: Noeud): Vec2 => ({ x: xLattice(n.cx), y: bande.y0 + 1 + n.cy * PAS });

  for (let essai = 0; essai < 80; essai++) {
    // cx = 0 est le côté entrée, cx = COLS-1 le côté sortie.
    const depart: Noeud = { cx: 0, cy: Math.floor(rng() * TREILLIS_ROWS) };
    const arrivee: Noeud = { cx: TREILLIS_COLS - 1, cy: Math.floor(rng() * TREILLIS_ROWS) };

    let cible = Math.max(segments, manhattan(depart, arrivee));
    if ((cible - manhattan(depart, arrivee)) % 2 !== 0) cible++;
    if (cible > TREILLIS_COLS * TREILLIS_ROWS - 1) cible -= 2;

    const noeuds = chercher(rng, depart, arrivee, cible);
    if (!noeuds) continue;

    const tuiles = noeuds.map(versTuile);
    return simplifier([
      { x: bande.xEntree, y: tuiles[0].y },
      ...tuiles,
      { x: bande.xSortie, y: tuiles[tuiles.length - 1].y },
    ]);
  }
  return cheminDeSecours(bande);
}

/** Serpentin garanti, au cas où la recherche échouerait (ne devrait pas arriver). */
function cheminDeSecours(bande: Bande): Vec2[] {
  const versLaGauche = bande.xSortie < bande.xEntree;
  const points: Vec2[] = [{ x: bande.xEntree, y: bande.y0 + 1 }];
  let versLeBas = true;
  for (let cx = 0; cx < TREILLIS_COLS; cx++) {
    const x = versLaGauche
      ? bande.xEntree - 1 - cx * PAS
      : bande.xEntree + 1 + cx * PAS;
    const yA = bande.y0 + 1 + (versLeBas ? 0 : (TREILLIS_ROWS - 1) * PAS);
    const yB = bande.y0 + 1 + (versLeBas ? (TREILLIS_ROWS - 1) * PAS : 0);
    points.push({ x, y: yA }, { x, y: yB });
    versLeBas = !versLeBas;
  }
  const dernier = points[points.length - 1];
  points.push({ x: bande.xSortie, y: dernier.y });
  return simplifier(points);
}

/* ------------------------------------------------------------------ */
/*  Spots de la ferme                                                  */
/* ------------------------------------------------------------------ */

export interface PlanSpot {
  gx: number;
  gy: number;
  ressource: TypeRessource;
}

/** Rectangle où chaque ressource a le droit d'apparaître, pour garder un plan lisible. */
export interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Répartit les spots par bandes thématiques — les champs au nord, les bosquets à
 * l'ouest, les filons à l'est, les carrières au sud-est — avec au moins une tuile
 * libre entre deux spots pour pouvoir glisser un bâtiment.
 */
export function genererSpots(
  rng: () => number,
  comptes: Record<TypeRessource, number>,
  ferme: Rect,
): PlanSpot[] {
  const largeur = ferme.x1 - ferme.x0;
  const hauteur = ferme.y1 - ferme.y0;

  const bandes: Record<TypeRessource, Rect> = {
    nourriture: {
      x0: ferme.x0 + 1,
      x1: ferme.x0 + Math.round(largeur * 0.7),
      y0: ferme.y0,
      y1: ferme.y0 + Math.round(hauteur * 0.4),
    },
    bois: {
      x0: ferme.x0,
      x1: ferme.x0 + Math.round(largeur * 0.5),
      y0: ferme.y0 + Math.round(hauteur * 0.5),
      y1: ferme.y1,
    },
    or: {
      x0: ferme.x0 + Math.round(largeur * 0.55),
      x1: ferme.x1,
      y0: ferme.y0,
      y1: ferme.y0 + Math.round(hauteur * 0.5),
    },
    pierre: {
      x0: ferme.x0 + Math.round(largeur * 0.55),
      x1: ferme.x1,
      y0: ferme.y0 + Math.round(hauteur * 0.6),
      y1: ferme.y1,
    },
  };

  const places: PlanSpot[] = [];
  const libre = (gx: number, gy: number): boolean =>
    places.every((p) => Math.max(Math.abs(p.gx - gx), Math.abs(p.gy - gy)) >= 2);

  for (const ressource of Object.keys(comptes) as TypeRessource[]) {
    for (let i = 0; i < comptes[ressource]; i++) {
      const zones = [bandes[ressource], ferme]; // on élargit à toute la ferme si ça coince
      let pose = false;
      for (const zone of zones) {
        for (let essai = 0; essai < 250 && !pose; essai++) {
          const gx = zone.x0 + Math.floor(rng() * (zone.x1 - zone.x0 + 1));
          const gy = zone.y0 + Math.floor(rng() * (zone.y1 - zone.y0 + 1));
          if (!libre(gx, gy)) continue;
          places.push({ gx, gy, ressource });
          pose = true;
        }
        if (pose) break;
      }
    }
  }
  return places;
}
