import { gridToWorld } from '../core/iso';
import type { Ennemi } from './enemies';
import { fractionCout, type Cout } from './resources';

export type TypeTour = 'coq' | 'aigle';
export type ModeCible = 'premier' | 'dernier' | 'fort' | 'proche';

export const LIBELLE_CIBLE: Record<ModeCible, string> = {
  premier: 'Premier',
  dernier: 'Dernier',
  fort: 'Plus fort',
  proche: 'Plus proche',
};

export const ORDRE_CIBLES: ModeCible[] = ['premier', 'dernier', 'fort', 'proche'];

export interface NiveauTour {
  degats: number;
  /** Portée en tuiles. */
  portee: number;
  /** Cadence en tirs par seconde. */
  cadence: number;
  /** Coût en âmes pour atteindre ce niveau (0 pour le niveau 1). */
  coutAmes: number;
  titre: string;
  desc: string;
  /** Rayon d'explosion en tuiles (Coq niveau 4). */
  aoe?: number;
  /** Nombre de rebonds sur des cibles voisines (Aigle niveau 4). */
  chaine?: number;
}

export interface DefTour {
  nom: string;
  pays: string;
  drapeau: string;
  role: string;
  /** Prix de construction. Les tours consomment la production de la ferme. */
  cout: Cout;
  cibleSol: boolean;
  cibleAir: boolean;
  /** Multiplicateur de dégâts contre les volants. */
  bonusAir: number;
  /** Vitesse du projectile en pixels monde par seconde. */
  vitesseProjectile: number;
  couleur: string;
  niveaux: NiveauTour[];
}

export const DEFS_TOURS: Record<TypeTour, DefTour> = {
  coq: {
    nom: 'Coq Gaulois',
    pays: 'France',
    drapeau: '🇫🇷',
    role: 'Anti-masse au sol, cadence élevée',
    cout: { or: 100, bois: 30 },
    cibleSol: true,
    cibleAir: false,
    bonusAir: 0,
    vitesseProjectile: 420,
    couleur: '#4f7dff',
    niveaux: [
      {
        degats: 3,
        portee: 3.0,
        cadence: 2.2,
        coutAmes: 0,
        titre: 'Coups de bec',
        desc: 'Picore vite et fort, mais ne voit pas le ciel.',
      },
      {
        degats: 4,
        portee: 3.4,
        cadence: 2.8,
        coutAmes: 25,
        titre: 'Bec acéré',
        desc: 'Bec affûté : plus de dégâts et une cadence relevée.',
      },
      {
        degats: 7,
        portee: 3.8,
        cadence: 3.4,
        coutAmes: 55,
        titre: 'Ergots d’acier',
        desc: 'Ergots renforcés : déchire les hordes de Goblinets.',
      },
      {
        degats: 10,
        portee: 4.2,
        cadence: 3.9,
        coutAmes: 110,
        titre: 'Pics Infernaux',
        desc: 'Chaque pic explose en gerbe de confettis (dégâts de zone).',
        aoe: 1.3,
      },
    ],
  },
  aigle: {
    nom: 'Aigle Chauve',
    pays: 'USA',
    drapeau: '🇺🇸',
    role: 'Anti-air en piqué, gros dégâts',
    cout: { or: 150, pierre: 25 },
    cibleSol: true,
    cibleAir: true,
    bonusAir: 2,
    vitesseProjectile: 620,
    couleur: '#e8b23a',
    niveaux: [
      {
        degats: 9,
        portee: 4.5,
        cadence: 0.9,
        coutAmes: 0,
        titre: 'Piqué',
        desc: 'Fond sur sa cible. Dégâts doublés contre les volants.',
      },
      {
        degats: 12,
        portee: 5.0,
        cadence: 1.0,
        coutAmes: 25,
        titre: 'Serres larges',
        desc: 'Serres élargies : portée et dégâts en hausse.',
      },
      {
        degats: 17,
        portee: 5.5,
        cadence: 1.15,
        coutAmes: 55,
        titre: 'Œil du rapace',
        desc: 'Repère ses proies de très loin.',
      },
      {
        degats: 26,
        portee: 6.0,
        cadence: 1.3,
        coutAmes: 110,
        titre: 'Éclairs Anti-Lead',
        desc: 'L’éclair rebondit sur 2 ennemis voisins (50 % des dégâts).',
        chaine: 2,
      },
    ],
  },
};

export interface Tour {
  id: number;
  type: TypeTour;
  def: DefTour;
  gx: number;
  gy: number;
  /** Niveau de 1 à 4. */
  niveau: number;
  /** Temps restant avant le prochain tir, en secondes. */
  recharge: number;
  mode: ModeCible;
  /** Orientation visuelle, en radians dans l'espace monde. */
  angle: number;
  kills: number;
  /** Animation de recul juste après un tir (1 → 0). */
  recul: number;
  t: number;
  /** Prix réellement payé (les coûts montent avec le nombre de tours), pour la revente. */
  paye: Cout;
}

let prochainId = 1;

export function creerTour(type: TypeTour, gx: number, gy: number, paye: Cout): Tour {
  return {
    id: prochainId++,
    type,
    def: DEFS_TOURS[type],
    gx,
    gy,
    paye,
    niveau: 1,
    recharge: 0,
    mode: 'premier',
    angle: 0,
    kills: 0,
    recul: 0,
    t: Math.random() * 10,
  };
}

export function niveauActuel(t: Tour): NiveauTour {
  return t.def.niveaux[t.niveau - 1];
}

export function prochainNiveau(t: Tour): NiveauTour | null {
  return t.niveau < t.def.niveaux.length ? t.def.niveaux[t.niveau] : null;
}

/** Valeur de revente : 70 % du prix payé. Les upgrades (en âmes) sont perdues. */
export function valeurRevente(t: Tour): Cout {
  return fractionCout(t.paye, 0.7);
}

export function peutViser(t: Tour, e: Ennemi): boolean {
  return e.def.volant ? t.def.cibleAir : t.def.cibleSol;
}

/** Dégâts effectifs de la tour contre un ennemi donné (bonus anti-air compris). */
export function degatsContre(t: Tour, e: Ennemi): number {
  const n = niveauActuel(t);
  return e.def.volant && t.def.bonusAir > 0 ? n.degats * t.def.bonusAir : n.degats;
}

/** Sélectionne une cible parmi les ennemis à portée, selon le mode de ciblage. */
export function choisirCible(t: Tour, ennemis: Ennemi[]): Ennemi | null {
  const portee = niveauActuel(t).portee;
  let best: Ennemi | null = null;
  let score = 0;

  for (const e of ennemis) {
    if (!e.vivant || !peutViser(t, e)) continue;
    const d = Math.hypot(e.gx - t.gx, e.gy - t.gy);
    if (d > portee) continue;

    let s: number;
    switch (t.mode) {
      case 'premier':
        s = e.parcours;
        break;
      case 'dernier':
        s = -e.parcours;
        break;
      case 'fort':
        s = e.pv;
        break;
      case 'proche':
        s = -d;
        break;
    }
    if (best === null || s > score) {
      best = e;
      score = s;
    }
  }
  return best;
}

/** Point de sortie du tir, en coordonnées monde (un peu au-dessus du sol). */
export function bouche(t: Tour): { x: number; y: number; z: number } {
  const w = gridToWorld(t.gx, t.gy);
  return { x: w.x, y: w.y, z: 26 };
}
