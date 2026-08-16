import type { TypeEnnemi } from '../game/enemies';
import type { TypeBatiment, TypeBebe } from '../game/farm';
import type { Banque } from '../game/resources';
import type { TypeTour } from '../game/towers';

/**
 * Réplication du plateau adverse par instantanés.
 *
 * Chaque joueur reste autoritaire sur son propre côté et publie 4 fois par seconde
 * une photo de son plateau. L'autre l'affiche en interpolant entre les deux
 * dernières photos reçues, avec un retard d'un intervalle — c'est ce retard qui rend
 * le mouvement fluide au lieu de saccadé.
 *
 * C'est le compromis retenu face au lockstep : aucun risque de divergence, aucune
 * contrainte de déterminisme sur le moteur, au prix d'un rendu adverse interpolé
 * plutôt qu'exact. À la vitesse de jeu du titre, l'écart est invisible.
 */

/** Champs volontairement courts : ces objets partent 4 fois par seconde. */
export interface InstTour {
  x: number;
  y: number;
  t: TypeTour;
  n: number;
}

export interface InstBebe {
  x: number;
  y: number;
  t: TypeBebe;
  /** Éclosion restante en secondes ; 0 = au travail. */
  e: number;
}

export interface InstBatiment {
  x: number;
  y: number;
  t: TypeBatiment;
}

export interface InstEnnemi {
  i: number;
  x: number;
  y: number;
  z: number;
  t: TypeEnnemi;
  /** Fraction de PV restants, de 0 à 1. */
  pv: number;
  /** Vrai si c'est une unité que *vous* lui avez envoyée. */
  env: boolean;
}

export interface Instantane {
  vies: number;
  vague: number;
  banque: Banque;
  tours: InstTour[];
  bebes: InstBebe[];
  bats: InstBatiment[];
  ennemis: InstEnnemi[];
}

/** Intervalle d'émission, en millisecondes. */
export const PERIODE_INSTANTANE = 250;

const arrondi = (v: number): number => Math.round(v * 100) / 100;

/** Ce que l'on publie de son propre plateau. */
export function capturer(source: {
  vies: number;
  vague: number;
  banque: Banque;
  tours: { gx: number; gy: number; type: TypeTour; niveau: number }[];
  bebes: { gx: number; gy: number; type: TypeBebe; eclosion: number }[];
  batiments: { gx: number; gy: number; type: TypeBatiment }[];
  ennemis: {
    id: number;
    gx: number;
    gy: number;
    z: number;
    type: TypeEnnemi;
    pv: number;
    pvMax: number;
    envoye: boolean;
  }[];
}): Instantane {
  return {
    vies: source.vies,
    vague: source.vague,
    banque: {
      nourriture: Math.floor(source.banque.nourriture),
      bois: Math.floor(source.banque.bois),
      or: Math.floor(source.banque.or),
      pierre: Math.floor(source.banque.pierre),
    },
    tours: source.tours.map((t) => ({ x: t.gx, y: t.gy, t: t.type, n: t.niveau })),
    bebes: source.bebes.map((b) => ({
      x: b.gx,
      y: b.gy,
      t: b.type,
      e: arrondi(b.eclosion),
    })),
    bats: source.batiments.map((b) => ({ x: b.gx, y: b.gy, t: b.type })),
    ennemis: source.ennemis.map((e) => ({
      i: e.id,
      x: arrondi(e.gx),
      y: arrondi(e.gy),
      z: arrondi(e.z),
      t: e.type,
      pv: arrondi(Math.max(0, e.pv / e.pvMax)),
      env: e.envoye,
    })),
  };
}

/**
 * Tampon des deux derniers instantanés reçus, avec interpolation des positions
 * d'ennemis. Le reste (tours, bébés, bâtiments) est pris tel quel : ça ne bouge pas.
 */
export class VueAdversaire {
  private precedent: Instantane | null = null;
  private courant: Instantane | null = null;
  private tPrecedent = 0;
  private tCourant = 0;

  /** Dernière réception, pour détecter un adversaire muet. */
  private derniereReception = 0;

  recevoir(s: Instantane, maintenant = performance.now()): void {
    this.precedent = this.courant;
    this.tPrecedent = this.tCourant;
    this.courant = s;
    this.tCourant = maintenant;
    this.derniereReception = maintenant;
  }

  present(maintenant = performance.now()): boolean {
    return this.courant !== null && maintenant - this.derniereReception < 3000;
  }

  /** Résumé immédiat, sans interpolation : ce qu'affiche la barre du haut. */
  resume(): { vies: number; vague: number; banque: Banque } | null {
    return this.courant
      ? { vies: this.courant.vies, vague: this.courant.vague, banque: this.courant.banque }
      : null;
  }

  vider(): void {
    this.precedent = null;
    this.courant = null;
  }

  /**
   * Plateau adverse à afficher maintenant. Les ennemis sont interpolés entre les
   * deux dernières photos, avec un retard d'une période pour toujours avoir deux
   * bornes valides.
   */
  etat(maintenant = performance.now()): Instantane | null {
    if (!this.courant) return null;
    if (!this.precedent) return this.courant;

    const intervalle = this.tCourant - this.tPrecedent;
    if (intervalle <= 0) return this.courant;

    const cible = maintenant - PERIODE_INSTANTANE;
    const alpha = Math.max(0, Math.min(1, (cible - this.tPrecedent) / intervalle));

    const avant = new Map(this.precedent.ennemis.map((e) => [e.i, e]));
    const ennemis = this.courant.ennemis.map((e) => {
      const a = avant.get(e.i);
      if (!a) return e; // apparu entre les deux photos : pas de position antérieure
      return {
        ...e,
        x: a.x + (e.x - a.x) * alpha,
        y: a.y + (e.y - a.y) * alpha,
        z: a.z + (e.z - a.z) * alpha,
      };
    });

    return { ...this.courant, ennemis };
  }
}
