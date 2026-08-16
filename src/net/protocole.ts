import type { TypeUnite } from '../game/army';
import type { NiveauCarte, NiveauFerme } from '../game/difficulty';
import type { Instantane } from './snapshot';

/**
 * Protocole du 1 vs 1.
 *
 * Choix d'architecture : chaque joueur simule **son propre plateau**, en local et
 * en autorité, et publie 4 fois par seconde une photo de ce plateau que l'autre
 * affiche en face. Pas de lockstep, donc aucune contrainte de déterminisme sur le
 * moteur et aucune divergence silencieuse possible.
 *
 * Contrepartie assumée : un client modifié peut tricher. Sans intérêt pour une
 * partie entre deux personnes qui se connaissent.
 */

/**
 * Le 1 vs 1 passe par la **même origine que la page**, sur ce chemin. En
 * production le serveur sert le jeu et écoute l'upgrade sur un port unique ; en
 * développement, Vite relaie `/ws` vers le serveur de salons local. Résultat :
 * la même URL marche partout, y compris derrière un reverse proxy en HTTPS.
 */
export const CHEMIN_WS = '/ws';

export interface JoueurSalon {
  pseudo: string;
  pret: boolean;
  /** Numéro d'ordre dans le salon : 0 = hôte, c'est lui qui fixe les réglages. */
  place: number;
}

export interface ReglagesPartie {
  ferme: NiveauFerme;
  carte: NiveauCarte;
  graine: number;
}

/* ---------------- Client → serveur ---------------- */

export type MsgClient =
  | { t: 'rejoindre'; salon: string; pseudo: string }
  | { t: 'reglages'; reglages: ReglagesPartie }
  | { t: 'pret'; pret: boolean }
  | { t: 'armee'; unites: TypeUnite[] }
  /** Photo de son propre plateau, 4 fois par seconde. */
  | { t: 'instantane'; s: Instantane }
  | { t: 'termine'; victoire: boolean; vies: number; vague: number };

/* ---------------- Serveur → client ---------------- */

export type MsgServeur =
  /** État du salon après chaque changement. */
  | { t: 'salon'; joueurs: JoueurSalon[]; maPlace: number; code: string }
  /** Les réglages de l'hôte, poussés aux deux joueurs. */
  | { t: 'reglages'; reglages: ReglagesPartie }
  /** Les deux joueurs sont prêts : la partie démarre maintenant. */
  | { t: 'demarrer'; reglages: ReglagesPartie }
  /** L'adversaire vous envoie du monde. */
  | { t: 'armee'; unites: TypeUnite[] }
  /** Photo du plateau adverse, à afficher en face. */
  | { t: 'instantane'; s: Instantane }
  /** Fin de partie, décidée par le serveur. */
  | { t: 'fin'; victoire: boolean; raison: string }
  | { t: 'adversaireParti' }
  | { t: 'erreur'; message: string };

export function encoder(m: MsgClient | MsgServeur): string {
  return JSON.stringify(m);
}

export function decoder<T>(brut: string): T | null {
  try {
    return JSON.parse(brut) as T;
  } catch {
    return null;
  }
}
