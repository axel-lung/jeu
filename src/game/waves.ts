import type { TypeEnnemi } from './enemies';

export interface GroupeVague {
  type: TypeEnnemi;
  nombre: number;
  /** Secondes entre deux apparitions du groupe. */
  intervalle: number;
  /** Secondes avant la première apparition du groupe, depuis le début de la vague. */
  attente: number;
}

export interface Vague {
  nom: string;
  groupes: GroupeVague[];
  /** Or versé à la fin de la vague. */
  recompense: number;
  boss: boolean;
}

/**
 * 10 vagues pour cette tranche : montée en masse, puis introduction des rapides,
 * puis des volants (qui forcent à construire un Aigle), et enfin le Titan.
 */
export const VAGUES: Vague[] = [
  {
    nom: 'Horde Gauloise',
    groupes: [{ type: 'goblinet', nombre: 8, intervalle: 1.0, attente: 0 }],
    recompense: 65,
    boss: false,
  },
  {
    nom: 'Pillards du matin',
    groupes: [{ type: 'goblinet', nombre: 14, intervalle: 0.75, attente: 0 }],
    recompense: 75,
    boss: false,
  },
  {
    nom: 'Premiers sauts',
    groupes: [
      { type: 'goblinet', nombre: 12, intervalle: 0.7, attente: 0 },
      { type: 'bunny', nombre: 6, intervalle: 1.2, attente: 5 },
    ],
    recompense: 85,
    boss: false,
  },
  {
    nom: 'Fièvre du lapin',
    groupes: [
      { type: 'bunny', nombre: 12, intervalle: 0.8, attente: 0 },
      { type: 'goblinet', nombre: 14, intervalle: 0.6, attente: 3 },
    ],
    recompense: 95,
    boss: false,
  },
  {
    nom: 'Ombres dans le ciel',
    groupes: [
      { type: 'goblinet', nombre: 16, intervalle: 0.6, attente: 0 },
      { type: 'bat', nombre: 8, intervalle: 1.0, attente: 4 },
    ],
    recompense: 105,
    boss: false,
  },
  {
    nom: 'Escadrille chibi',
    groupes: [
      { type: 'bat', nombre: 12, intervalle: 0.7, attente: 0 },
      { type: 'bunny', nombre: 16, intervalle: 0.5, attente: 2 },
    ],
    recompense: 115,
    boss: false,
  },
  {
    nom: 'Marée de sacs',
    groupes: [{ type: 'goblinet', nombre: 40, intervalle: 0.3, attente: 0 }],
    recompense: 130,
    boss: false,
  },
  {
    nom: 'Raid mixte',
    groupes: [
      { type: 'bat', nombre: 16, intervalle: 0.55, attente: 0 },
      { type: 'bunny', nombre: 20, intervalle: 0.4, attente: 2 },
      { type: 'goblinet', nombre: 20, intervalle: 0.4, attente: 6 },
    ],
    recompense: 145,
    boss: false,
  },
  {
    nom: 'Avant la tempête',
    groupes: [
      { type: 'goblinet', nombre: 30, intervalle: 0.32, attente: 0 },
      { type: 'bunny', nombre: 18, intervalle: 0.38, attente: 4 },
      { type: 'bat', nombre: 18, intervalle: 0.45, attente: 8 },
    ],
    recompense: 165,
    boss: false,
  },
  {
    nom: 'CHIBI TITAN',
    groupes: [
      { type: 'goblinet', nombre: 20, intervalle: 0.4, attente: 0 },
      { type: 'titan', nombre: 1, intervalle: 1, attente: 6 },
      { type: 'bat', nombre: 16, intervalle: 0.45, attente: 10 },
      { type: 'bunny', nombre: 20, intervalle: 0.35, attente: 18 },
    ],
    recompense: 350,
    boss: true,
  },
];

/** Les PV des ennemis montent de 14 % par vague — un Goblinet de la vague 10 pique. */
export function facteurPv(numeroVague: number): number {
  return 1 + (numeroVague - 1) * 0.14;
}

/** Nombre total d'ennemis d'une vague (affiché dans l'annonce). */
export function tailleVague(v: Vague): number {
  return v.groupes.reduce((n, g) => n + g.nombre, 0);
}
