import { clamp, damp } from './utils';
import type { Vec2 } from './iso';

/** Caméra 2D : translation + zoom, avec un léger lissage sur le zoom. */
export class Camera {
  /** Point du monde visé par le centre de l'écran. */
  x = 0;
  y = 0;
  zoom = 1;

  private zoomCible = 1;
  private readonly zoomMin = 0.35;
  private readonly zoomMax = 2.4;
  /** Point visé par un déplacement automatique (bascule de zone), ou null. */
  private cible: Vec2 | null = null;

  /** Taille de la zone d'affichage en pixels CSS. Mise à jour au resize. */
  viewW = 1;
  viewH = 1;

  worldToScreen(wx: number, wy: number): Vec2 {
    return {
      x: (wx - this.x) * this.zoom + this.viewW / 2,
      y: (wy - this.y) * this.zoom + this.viewH / 2,
    };
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    return {
      x: (sx - this.viewW / 2) / this.zoom + this.x,
      y: (sy - this.viewH / 2) / this.zoom + this.y,
    };
  }

  /** Applique la transformation caméra au contexte : on dessine ensuite en coords monde. */
  applyTo(ctx: CanvasRenderingContext2D): void {
    ctx.translate(this.viewW / 2, this.viewH / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }

  /** Déplacement exprimé en pixels écran (glisser souris). Annule le déplacement auto. */
  panScreen(dx: number, dy: number): void {
    this.cible = null;
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  /** Déplacement exprimé en pixels monde (clavier), indépendant du zoom. */
  panWorld(dx: number, dy: number): void {
    this.cible = null;
    this.x += dx;
    this.y += dy;
  }

  /** Glisse en douceur vers un point du monde (bascule défense ↔ ferme). */
  viser(wx: number, wy: number): void {
    this.cible = { x: wx, y: wy };
  }

  /** Zoom molette centré sur le curseur : le point sous la souris reste sous la souris. */
  zoomVers(sx: number, sy: number, facteur: number): void {
    const avant = this.screenToWorld(sx, sy);
    this.zoomCible = clamp(this.zoomCible * facteur, this.zoomMin, this.zoomMax);
    this.zoom = this.zoomCible; // appliqué tout de suite pour le calcul de recentrage
    const apres = this.screenToWorld(sx, sy);
    this.x += avant.x - apres.x;
    this.y += avant.y - apres.y;
  }

  update(dt: number): void {
    this.zoom = damp(this.zoom, this.zoomCible, 18, dt);
    if (this.cible) {
      this.x = damp(this.x, this.cible.x, 7, dt);
      this.y = damp(this.y, this.cible.y, 7, dt);
      if (Math.hypot(this.cible.x - this.x, this.cible.y - this.y) < 1) this.cible = null;
    }
  }

  /** Recentre instantanément sur un point du monde. */
  centrerSur(wx: number, wy: number): void {
    this.cible = null;
    this.x = wx;
    this.y = wy;
  }
}
