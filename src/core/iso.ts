/**
 * Projection isométrique 2.5D.
 *
 * Trois espaces de coordonnées coexistent dans le jeu :
 *   - grille  : (gx, gy) en tuiles, fractionnaire pour les entités qui se déplacent ;
 *   - monde   : pixels après projection iso, indépendants de la caméra ;
 *   - écran   : pixels du canvas, une fois la caméra (pan + zoom) appliquée.
 *
 * Ce module ne connaît que les deux premiers. La caméra s'occupe du troisième.
 */

/** Largeur/hauteur du losange d'une tuile en pixels monde. Le ratio 2:1 est le standard iso. */
export const TILE_W = 64;
export const TILE_H = 32;

export interface Vec2 {
  x: number;
  y: number;
}

/** Centre de la tuile (gx, gy) en coordonnées monde. Accepte des coords fractionnaires. */
export function gridToWorld(gx: number, gy: number): Vec2 {
  return { x: (gx - gy) * (TILE_W / 2), y: (gx + gy) * (TILE_H / 2) };
}

/** Inverse de gridToWorld. Le résultat est fractionnaire : Math.round() donne la tuile visée. */
export function worldToGrid(wx: number, wy: number): Vec2 {
  const diff = (wx * 2) / TILE_W; // gx - gy
  const somme = (wy * 2) / TILE_H; // gx + gy
  return { x: (somme + diff) / 2, y: (somme - diff) / 2 };
}

/** Les 4 coins du losange d'une tuile, dans l'ordre haut → droite → bas → gauche. */
export function tileDiamond(gx: number, gy: number): Vec2[] {
  const c = gridToWorld(gx, gy);
  return [
    { x: c.x, y: c.y - TILE_H / 2 },
    { x: c.x + TILE_W / 2, y: c.y },
    { x: c.x, y: c.y + TILE_H / 2 },
    { x: c.x - TILE_W / 2, y: c.y },
  ];
}

/** Trace le losange d'une tuile dans le contexte (sans le remplir). */
export function pathTile(ctx: CanvasRenderingContext2D, gx: number, gy: number): void {
  const p = tileDiamond(gx, gy);
  ctx.beginPath();
  ctx.moveTo(p[0].x, p[0].y);
  ctx.lineTo(p[1].x, p[1].y);
  ctx.lineTo(p[2].x, p[2].y);
  ctx.lineTo(p[3].x, p[3].y);
  ctx.closePath();
}

/**
 * Clé de tri en profondeur : plus la valeur est grande, plus l'objet est « devant »
 * et doit donc être dessiné tard. C'est ce qui donne l'illusion de 2.5D.
 */
export function depthOf(gx: number, gy: number): number {
  return gx + gy;
}
