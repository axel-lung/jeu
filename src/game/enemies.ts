import type { GameMap, Joueur } from './map';
import type { TypeRessource } from './resources';

export type TypeEnnemi = 'goblinet' | 'bunny' | 'bat' | 'titan';

export interface DefEnnemi {
  nom: string;
  /** Points de vie de base, avant la mise à l'échelle par vague. */
  pv: number;
  /** Vitesse en tuiles par seconde. */
  vitesse: number;
  volant: boolean;
  /** Réduction des dégâts subis, de 0 à 1 (bouclier du Titan). */
  armure: number;
  /** Récompenses au kill. */
  ames: number;
  or: number;
  /** Vies perdues si l'ennemi atteint la sortie. */
  degatsVies: number;
  /** Butin emporté si l'ennemi atteint la sortie : chaque espèce a son vice. */
  pillage: { ressource: TypeRessource; quantite: number };
  /** Rayon approximatif en pixels monde, pour la détection de collision des projectiles. */
  taille: number;
  couleur: string;
  boss: boolean;
}

export const DEFS_ENNEMIS: Record<TypeEnnemi, DefEnnemi> = {
  goblinet: {
    nom: 'Goblinet Pilleur',
    pv: 16,
    vitesse: 1.5,
    volant: false,
    armure: 0,
    ames: 1,
    or: 2,
    degatsVies: 1,
    pillage: { ressource: 'nourriture', quantite: 10 },
    taille: 11,
    couleur: '#7bd66b',
    boss: false,
  },
  bunny: {
    nom: 'Bunny Demon',
    pv: 13,
    vitesse: 3.1,
    volant: false,
    armure: 0,
    ames: 2,
    or: 2,
    degatsVies: 1,
    pillage: { ressource: 'bois', quantite: 5 },
    taille: 10,
    couleur: '#ffb3d1',
    boss: false,
  },
  bat: {
    nom: 'Chibi Bat',
    pv: 22,
    vitesse: 2.1,
    volant: true,
    armure: 0,
    ames: 3,
    or: 4,
    degatsVies: 2,
    pillage: { ressource: 'or', quantite: 10 },
    taille: 11,
    couleur: '#b18cff',
    boss: false,
  },
  titan: {
    nom: 'Chibi Titan',
    pv: 900,
    vitesse: 0.75,
    volant: false,
    armure: 0.35,
    ames: 50,
    or: 80,
    degatsVies: 10,
    pillage: { ressource: 'nourriture', quantite: 50 },
    taille: 22,
    couleur: '#ff6b5a',
    boss: true,
  },
};

export interface Ennemi {
  id: number;
  type: TypeEnnemi;
  def: DefEnnemi;
  pv: number;
  pvMax: number;
  /** Distance parcourue le long du chemin, en tuiles. Sert aussi au ciblage premier/dernier. */
  parcours: number;
  gx: number;
  gy: number;
  /** Altitude en pixels monde (les volants planent au-dessus de leur ombre). */
  z: number;
  vivant: boolean;
  /** Horloge propre à l'entité, pour désynchroniser les animations. */
  t: number;
  /** Temps restant de clignotement blanc après un coup encaissé. */
  flash: number;
  echelle: number;
  /** Vrai si l'ennemi a été payé et envoyé par l'adversaire (fanion sur le sprite). */
  envoye: boolean;
}

let prochainId = 1;

export function creerEnnemi(
  type: TypeEnnemi,
  facteurPv: number,
  envoye = false,
  decalage = 0,
): Ennemi {
  const def = DEFS_ENNEMIS[type];
  const pv = Math.round(def.pv * facteurPv);
  return {
    id: prochainId++,
    type,
    def,
    pv,
    pvMax: pv,
    parcours: -decalage,
    gx: 0,
    gy: 0,
    z: def.volant ? 34 : 0,
    vivant: true,
    t: Math.random() * 10,
    flash: 0,
    echelle: 1,
    envoye,
  };
}

/**
 * Avance l'ennemi le long du chemin.
 * Renvoie true si l'ennemi a atteint la sortie (fuite) — l'appelant gère la sanction.
 */
export function majEnnemi(e: Ennemi, dt: number, map: GameMap, joueur: Joueur): boolean {
  e.t += dt;
  e.flash = Math.max(0, e.flash - dt);
  e.parcours += e.def.vitesse * dt;

  const p = map.pointSurChemin(joueur, Math.max(0, e.parcours));
  e.gx = p.x;
  e.gy = p.y;

  if (e.def.volant) {
    e.z = 34 + Math.sin(e.t * 5) * 4; // battements d'ailes
  } else if (e.type === 'bunny') {
    e.z = Math.abs(Math.sin(e.t * 9)) * 12; // sautillements nerveux
  } else {
    e.z = Math.abs(Math.sin(e.t * 6)) * 3;
  }

  return e.parcours >= map.longueurs[joueur];
}

/** Applique des dégâts en tenant compte de l'armure. Renvoie true si l'ennemi meurt. */
export function infligerDegats(e: Ennemi, degats: number): boolean {
  if (!e.vivant) return false;
  e.pv -= degats * (1 - e.def.armure);
  e.flash = 0.09;
  if (e.pv <= 0) {
    e.vivant = false;
    return true;
  }
  return false;
}
