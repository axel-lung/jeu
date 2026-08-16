import type { SpotRessource } from './map';
import type { Cout, TypeRessource } from './resources';

/** Production de base d'un bébé, en unités par seconde, avant bonus. */
export const TAUX_BASE = 1;

/**
 * Nourriture consommée par bébé et par seconde.
 *
 * Sans entretien, la nourriture n'a plus aucun débouché dès que les 14 spots sont
 * occupés et s'empile par milliers. L'entretien lui rend un rôle permanent : plus
 * la ferme grandit, plus il faut de bouches affectées aux champs pour la tenir.
 * Un déficit ne fait rien de dramatique — le stock plafonne simplement à zéro.
 */
export const ENTRETIEN_PAR_BEBE = 0.12;

/** Plafond de bébés simultanés (le nombre de spots est de toute façon plus bas). */
export const LIMITE_BEBES = 20;

/* ------------------------------------------------------------------ */
/*  Bébés animaux — les ouvriers de la ferme                           */
/* ------------------------------------------------------------------ */

export type TypeBebe = 'poussin' | 'aiglon';

export interface DefBebe {
  nom: string;
  pays: string;
  drapeau: string;
  cout: Cout;
  /** Durée d'éclosion en secondes : le bébé ne produit rien avant. */
  eclosion: number;
  /** Ressources sur lesquelles ce bébé applique son bonus national. */
  specialites: TypeRessource[];
  bonus: number;
  desc: string;
}

export const DEFS_BEBES: Record<TypeBebe, DefBebe> = {
  poussin: {
    nom: 'Poussin',
    pays: 'France',
    drapeau: '🇫🇷',
    cout: { nourriture: 50 },
    eclosion: 10,
    specialites: ['nourriture'],
    bonus: 0.3,
    desc: '+30 % sur les champs de blé. À poser sur la nourriture.',
  },
  aiglon: {
    nom: 'Aiglon',
    pays: 'USA',
    drapeau: '🇺🇸',
    cout: { nourriture: 50 },
    eclosion: 10,
    specialites: ['or', 'pierre'],
    bonus: 0.25,
    desc: '+25 % sur les filons et les carrières. À poser sur l’or ou la pierre.',
  },
};

export interface Bebe {
  id: number;
  type: TypeBebe;
  def: DefBebe;
  gx: number;
  gy: number;
  /** Spot exploité par ce bébé. */
  spotId: number;
  /** Temps d'éclosion restant ; 0 = éclos et productif. */
  eclosion: number;
  t: number;
  /** Production cumulée depuis le dernier texte flottant. */
  tampon: number;
  /** Production totale, affichée dans le panneau. */
  produit: number;
  /** Nourriture réellement dépensée (le prix monte avec le nombre de bouches). */
  paye: Cout;
}

let prochainIdBebe = 1;

export function creerBebe(type: TypeBebe, spot: SpotRessource, paye: Cout): Bebe {
  const def = DEFS_BEBES[type];
  return {
    id: prochainIdBebe++,
    type,
    def,
    gx: spot.gx,
    gy: spot.gy,
    spotId: spot.id,
    paye,
    eclosion: def.eclosion,
    t: Math.random() * 10,
    tampon: 0,
    produit: 0,
  };
}

/* ------------------------------------------------------------------ */
/*  Bâtiments de ferme — ils boostent les spots alentour               */
/* ------------------------------------------------------------------ */

export type TypeBatiment = 'moulin' | 'campBuches' | 'campMine' | 'entrepot';

export interface DefBatiment {
  nom: string;
  icone: string;
  cout: Cout;
  /** Rayon d'effet en tuiles. */
  rayon: number;
  /** Ressources boostées. */
  cibles: TypeRessource[];
  bonus: number;
  desc: string;
}

export const DEFS_BATIMENTS: Record<TypeBatiment, DefBatiment> = {
  moulin: {
    nom: 'Moulin',
    icone: '🌾',
    cout: { bois: 80 },
    rayon: 3,
    cibles: ['nourriture'],
    bonus: 0.25,
    desc: '+25 % de nourriture sur les champs à 3 tuiles.',
  },
  campBuches: {
    nom: 'Camp de bûches',
    icone: '🪵',
    cout: { bois: 60 },
    rayon: 3,
    cibles: ['bois'],
    bonus: 0.25,
    desc: '+25 % de bois sur les bosquets à 3 tuiles.',
  },
  campMine: {
    nom: 'Camp de mine',
    icone: '⛏️',
    cout: { bois: 80, pierre: 30 },
    rayon: 3,
    cibles: ['or', 'pierre'],
    bonus: 0.25,
    desc: '+25 % sur les filons et carrières à 3 tuiles.',
  },
  entrepot: {
    nom: 'Entrepôt',
    icone: '🏚️',
    cout: { bois: 100, pierre: 60 },
    rayon: 99,
    cibles: ['nourriture', 'bois', 'or', 'pierre'],
    bonus: 0.1,
    desc: '+10 % sur toute la production de la ferme. Cumulable.',
  },
};

export interface Batiment {
  id: number;
  type: TypeBatiment;
  def: DefBatiment;
  gx: number;
  gy: number;
  t: number;
  /** Prix réellement payé, pour la démolition. */
  paye: Cout;
}

let prochainIdBatiment = 1;

export function creerBatiment(
  type: TypeBatiment,
  gx: number,
  gy: number,
  paye: Cout,
): Batiment {
  return {
    id: prochainIdBatiment++,
    type,
    def: DEFS_BATIMENTS[type],
    gx,
    gy,
    t: Math.random() * 10,
    paye,
  };
}

/* ------------------------------------------------------------------ */

/** Vrai si le bâtiment couvre ce spot (bonne ressource et dans le rayon). */
export function couvre(b: Batiment, spot: SpotRessource): boolean {
  if (!b.def.cibles.includes(spot.ressource)) return false;
  return Math.hypot(b.gx - spot.gx, b.gy - spot.gy) <= b.def.rayon;
}

/**
 * Multiplicateur de récolte : 1 + bonus national du bébé + bonus des bâtiments
 * qui couvrent le spot. Les bonus s'additionnent plutôt que de se multiplier,
 * pour rester lisible dans l'interface.
 */
export function multiplicateur(spot: SpotRessource, bebe: Bebe, batiments: Batiment[]): number {
  let m = 1;
  if (bebe.def.specialites.includes(spot.ressource)) m += bebe.def.bonus;
  for (const b of batiments) if (couvre(b, spot)) m += b.def.bonus;
  return m;
}

/** Production instantanée d'un bébé, en unités par seconde (0 s'il n'est pas éclos). */
export function tauxDe(spot: SpotRessource, bebe: Bebe, batiments: Batiment[]): number {
  if (bebe.eclosion > 0) return 0;
  return TAUX_BASE * multiplicateur(spot, bebe, batiments);
}
