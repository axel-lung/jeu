import type { TypeRessource } from './resources';

/**
 * Deux axes de difficulté indépendants.
 *
 *   - la ferme  : combien de ressources on récolte, et à quel prix on construit ;
 *   - la carte  : la longueur du chemin, donc le temps que les tours ont pour tirer.
 *
 * Les croiser donne neuf combinaisons : « ferme abondante + carte directe » est une
 * partie riche mais nerveuse, « ferme aride + carte sinueuse » l'inverse exact.
 */

/* ------------------------------------------------------------------ */
/*  Axe 1 — la ferme                                                   */
/* ------------------------------------------------------------------ */

export type NiveauFerme = 'abondante' | 'normale' | 'aride';

export interface ReglagesFerme {
  nom: string;
  cran: string;
  resume: string;
  /** Multiplicateur sur les ressources de départ. */
  depart: number;
  /** Multiplicateur sur tous les prix de construction (tours, bébés, bâtiments). */
  couts: number;
  /** Nombre de spots de récolte générés, par ressource. */
  spots: Record<TypeRessource, number>;
}

export const FERMES: Record<NiveauFerme, ReglagesFerme> = {
  abondante: {
    nom: 'Abondante',
    cran: 'Facile',
    resume: 'Plus de spots, plus de stock au départ, prix adoucis.',
    depart: 1.4,
    couts: 0.85,
    spots: { nourriture: 6, bois: 5, or: 4, pierre: 3 },
  },
  normale: {
    nom: 'Normale',
    cran: 'Normal',
    resume: 'L’équilibre de référence : 14 spots, prix de base.',
    depart: 1,
    couts: 1,
    spots: { nourriture: 5, bois: 4, or: 3, pierre: 2 },
  },
  aride: {
    nom: 'Aride',
    cran: 'Difficile',
    // Le nombre de filons d'or reste à 3 : le descendre à 2 ne rend pas la partie
    // difficile, il la rend infaisable — l'or finance toutes les tours.
    resume: 'Deux spots de moins, stock de départ réduit, tout coûte 10 % de plus.',
    depart: 0.8,
    couts: 1.1,
    spots: { nourriture: 4, bois: 3, or: 3, pierre: 2 },
  },
};

export const ORDRE_FERMES: NiveauFerme[] = ['abondante', 'normale', 'aride'];

/* ------------------------------------------------------------------ */
/*  Axe 2 — la carte                                                   */
/* ------------------------------------------------------------------ */

export type NiveauCarte = 'sinueuse' | 'equilibree' | 'directe';

export interface ReglagesCarte {
  nom: string;
  cran: string;
  resume: string;
  /** Nombre de segments du chemin sur le treillis (3 tuiles par segment). */
  segments: number;
  /**
   * Densité de décor *au bord du chemin*, de 0 à 1.
   *
   * La longueur seule est un levier faible : un chemin court est aussi plus facile
   * à couvrir, les mêmes tours en arrosent une plus grande fraction, et les deux
   * effets s'annulent presque. L'encombrement, lui, ne s'annule pas — il retire
   * directement des emplacements de tir le long du tracé.
   */
  encombrement: number;
  /**
   * Multiplicateur de PV des ennemis.
   *
   * Mesuré : même en encombrant le terrain, la couverture *sature* — 15 tours de
   * portée 3 blindent à peu près n'importe quel tracé, et l'écart de difficulté
   * plafonne à ~20 %. La géométrie ne peut donc pas porter seule les trois crans.
   * La longueur du chemin reste la signature visible de l'axe, la pression sur les
   * PV lui donne du mordant.
   */
  pression: number;
}

export const CARTES: Record<NiveauCarte, ReglagesCarte> = {
  sinueuse: {
    nom: 'Sinueuse',
    cran: 'Facile',
    resume: 'Chemin long, terrain dégagé, ennemis plus fragiles (−8 % PV).',
    segments: 21,
    encombrement: 0.04,
    pression: 0.92,
  },
  equilibree: {
    nom: 'Équilibrée',
    cran: 'Normal',
    resume: 'Longueur moyenne, quelques bosquets à contourner, PV de référence.',
    segments: 15,
    encombrement: 0.3,
    pression: 1,
  },
  directe: {
    nom: 'Directe',
    cran: 'Difficile',
    // 11 segments (~35 cases) et pas moins : en dessous, aucun placement de tours ne
    // couvre assez le chemin et les fuites déclenchent une spirale irrattrapable.
    resume: 'Chemin court, terrain encombré, ennemis coriaces (+15 % PV).',
    segments: 11,
    encombrement: 0.52,
    pression: 1.15,
  },
};

export const ORDRE_CARTES: NiveauCarte[] = ['sinueuse', 'equilibree', 'directe'];

/* ------------------------------------------------------------------ */

export interface Options {
  ferme: NiveauFerme;
  carte: NiveauCarte;
  /** Graine de génération : deux parties avec la même graine ont la même carte. */
  graine: number;
}

export const OPTIONS_DEFAUT: Options = {
  ferme: 'normale',
  carte: 'equilibree',
  graine: 1,
};
