import type { TypeEnnemi } from './enemies';
import type { Cout } from './resources';

/**
 * L'armée que l'on prépare pendant le répit et que l'on balance sur l'adversaire
 * au lancement de la vague.
 *
 * Ce que vous envoyez est exactement ce que vous affrontez : une unité achetée
 * arrive chez l'adversaire comme un ennemi ordinaire, mêlé à sa vague. La monnaie
 * est nourriture + or — nourrir et équiper une troupe — ce qui donne enfin à la
 * nourriture un débouché permanent en fin de partie.
 *
 * Le contre-jeu est intégré : l'adversaire touche les âmes et l'or des unités qu'il
 * tue. Sur-envoyer, c'est financer ses upgrades.
 *
 * Les unités n'ont pas d'existence propre : elles arrivent chez l'adversaire comme
 * des `Ennemi` marqués `envoye`, sur son chemin à lui — que l'on voit, puisque toute
 * la carte est partagée.
 */

export type TypeUnite = 'goblinet' | 'bunny' | 'bat';

export interface DefUnite {
  nom: string;
  /** L'ennemi correspondant chez l'adversaire. */
  ennemi: TypeEnnemi;
  cout: Cout;
  role: string;
  icone: string;
}

export const DEFS_UNITES: Record<TypeUnite, DefUnite> = {
  goblinet: {
    nom: 'Goblinet',
    ennemi: 'goblinet',
    cout: { nourriture: 20, or: 12 },
    role: 'Masse bon marché : sature les tours à cadence lente.',
    icone: '👺',
  },
  bunny: {
    nom: 'Bunny Demon',
    ennemi: 'bunny',
    cout: { nourriture: 25, or: 22 },
    role: 'Rapide : traverse avant que les tours lentes ne réagissent.',
    icone: '🐰',
  },
  bat: {
    nom: 'Chibi Bat',
    ennemi: 'bat',
    cout: { nourriture: 30, or: 40 },
    role: 'Volant : inutile si l’adversaire n’a pas d’anti-air.',
    icone: '🦇',
  },
};

export const ORDRE_UNITES: TypeUnite[] = ['goblinet', 'bunny', 'bat'];

/** Compte les unités d'une file par type, pour l'affichage. */
export function compter(file: TypeUnite[]): Record<TypeUnite, number> {
  const out: Record<TypeUnite, number> = { goblinet: 0, bunny: 0, bat: 0 };
  for (const u of file) out[u]++;
  return out;
}
