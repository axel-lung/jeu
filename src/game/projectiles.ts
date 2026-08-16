import { gridToWorld } from '../core/iso';
import type { Ennemi } from './enemies';

export type TypeProjectile = 'pic' | 'eclair';

export interface Projectile {
  id: number;
  type: TypeProjectile;
  /** Tour qui a tiré, pour lui créditer les kills. */
  tourId: number;
  /** Position en coordonnées monde. `z` est l'altitude (soustraite au dessin). */
  x: number;
  y: number;
  z: number;
  vitesse: number;
  degats: number;
  cibleId: number;
  couleur: string;
  /** Rayon d'explosion en tuiles, si le projectile en a un. */
  aoe: number;
  /** Nombre de rebonds restants vers des ennemis voisins. */
  chaine: number;
  /** Cibles déjà touchées par la chaîne, pour ne pas rebondir en boucle. */
  dejaTouches: number[];
  angle: number;
  /** Positions précédentes, pour la traînée. */
  trainee: { x: number; y: number; z: number }[];
  vivant: boolean;
}

let prochainId = 1;

export function creerProjectile(
  depart: { x: number; y: number; z: number },
  cible: Ennemi,
  opts: {
    type: TypeProjectile;
    tourId: number;
    degats: number;
    vitesse: number;
    couleur: string;
    aoe?: number;
    chaine?: number;
    dejaTouches?: number[];
  },
): Projectile {
  return {
    id: prochainId++,
    type: opts.type,
    tourId: opts.tourId,
    x: depart.x,
    y: depart.y,
    z: depart.z,
    vitesse: opts.vitesse,
    degats: opts.degats,
    cibleId: cible.id,
    couleur: opts.couleur,
    aoe: opts.aoe ?? 0,
    chaine: opts.chaine ?? 0,
    dejaTouches: opts.dejaTouches ?? [cible.id],
    angle: 0,
    trainee: [],
    vivant: true,
  };
}

/** Position monde du centre du corps d'un ennemi (là où visent les projectiles). */
export function pointVise(e: Ennemi): { x: number; y: number; z: number } {
  const w = gridToWorld(e.gx, e.gy);
  return { x: w.x, y: w.y, z: e.z + e.def.taille * 0.8 };
}

/**
 * Déplace le projectile vers sa cible.
 * Renvoie l'ennemi touché si l'impact a lieu cette frame, `null` sinon.
 * Un projectile dont la cible est morte poursuit sa trajectoire et se dissipe.
 */
export function majProjectile(
  p: Projectile,
  dt: number,
  ennemis: Map<number, Ennemi>,
): Ennemi | null {
  const cible = ennemis.get(p.cibleId);

  p.trainee.push({ x: p.x, y: p.y, z: p.z });
  if (p.trainee.length > 6) p.trainee.shift();

  if (!cible || !cible.vivant) {
    // Plus de cible : le projectile continue tout droit un court instant puis disparaît.
    p.x += Math.cos(p.angle) * p.vitesse * dt;
    p.y += Math.sin(p.angle) * p.vitesse * dt * 0.5;
    p.z -= 60 * dt;
    if (p.z < -10) p.vivant = false;
    return null;
  }

  const but = pointVise(cible);
  const dx = but.x - p.x;
  const dy = but.y - p.y;
  const dz = but.z - p.z;
  const d = Math.hypot(dx, dy, dz);
  const pas = p.vitesse * dt;

  p.angle = Math.atan2(dy, dx);

  if (d <= pas || d < 4) {
    p.x = but.x;
    p.y = but.y;
    p.z = but.z;
    p.vivant = false;
    return cible;
  }

  p.x += (dx / d) * pas;
  p.y += (dy / d) * pas;
  p.z += (dz / d) * pas;
  return null;
}
