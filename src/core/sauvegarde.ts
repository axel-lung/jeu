/**
 * Ce que le joueur emporte d'une partie à l'autre.
 *
 * Jusqu'ici, fermer l'onglet effaçait tout : aucun record, aucun réglage retenu,
 * donc aucune raison d'en relancer une. Ce module tient ce fil — préférences,
 * compteurs, et le meilleur résultat par combinaison de difficulté.
 *
 * Le stockage est du `localStorage`, donc local à l'appareil et au navigateur.
 * Il peut échouer partout (navigation privée, quota plein, cookies bloqués,
 * capture de vignette) : chaque accès est isolé et son échec ignoré. Le jeu doit
 * rester jouable sans mémoire, simplement sans records.
 */

import type { NiveauCarte, NiveauFerme } from '../game/difficulty';

const CLE = 'nations-defense';

/**
 * Numéro de schéma. Une sauvegarde d'une autre version est ignorée plutôt que
 * migrée : ce sont des records et des préférences, pas une progression longue.
 * Le jour où ça changera, c'est ici qu'une migration s'écrira.
 */
const VERSION = 1;

/** Le meilleur résultat obtenu sur une combinaison de difficulté. */
export interface Record {
  /** Vague atteinte (10 = les dix vagues tenues). */
  vague: number;
  /** Durée de la partie, en secondes de jeu. */
  chrono: number;
  victoire: boolean;
  /** Horodatage, pour un éventuel « nouveau record aujourd'hui ». */
  quand: number;
}

export interface Donnees {
  version: number;
  reglages: {
    effets: boolean;
    musique: boolean;
  };
  /** Dernière difficulté choisie : le menu la repropose. */
  derniereDifficulte: { ferme: NiveauFerme; carte: NiveauCarte } | null;
  /** Identité de salon, pour ne pas la ressaisir à chaque partie en ligne. */
  duel: { pseudo: string; salon: string } | null;
  parties: number;
  victoires: number;
  /** Cumuls sur toutes les parties, de quoi nourrir un écran de statistiques. */
  ennemisTues: number;
  toursPosees: number;
  /** Un record par combinaison, indexé par `ferme+carte`. */
  records: { [combinaison: string]: Record };
}

function vide(): Donnees {
  return {
    version: VERSION,
    reglages: { effets: true, musique: true },
    derniereDifficulte: null,
    duel: null,
    parties: 0,
    victoires: 0,
    ennemisTues: 0,
    toursPosees: 0,
    records: {},
  };
}

/**
 * Lit la sauvegarde. Tout ce qui manque ou détonne est remplacé par la valeur
 * par défaut : une sauvegarde à moitié corrompue vaut mieux qu'un écran noir.
 */
function lire(): Donnees {
  const defaut = vide();
  let brut: string | null = null;
  try {
    brut = localStorage.getItem(CLE);
  } catch {
    return defaut;
  }
  if (!brut) return defaut;

  try {
    const lu = JSON.parse(brut) as Partial<Donnees>;
    if (lu.version !== VERSION) return defaut;
    return {
      ...defaut,
      ...lu,
      reglages: { ...defaut.reglages, ...lu.reglages },
      records: { ...lu.records },
    };
  } catch {
    return defaut;
  }
}

let donnees = lire();

function ecrire(): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(donnees));
  } catch {
    // Quota plein ou stockage refusé : la partie en cours n'en souffre pas.
  }
}

/** L'état courant, en lecture. Passez par les fonctions ci-dessous pour écrire. */
export function sauvegarde(): Readonly<Donnees> {
  return donnees;
}

export function clePour(ferme: NiveauFerme, carte: NiveauCarte): string {
  return `${ferme}+${carte}`;
}

export function recordPour(ferme: NiveauFerme, carte: NiveauCarte): Record | null {
  return donnees.records[clePour(ferme, carte)] ?? null;
}

export function reglerSon(effets: boolean, musique: boolean): void {
  donnees.reglages = { effets, musique };
  ecrire();
}

export function retenirDifficulte(ferme: NiveauFerme, carte: NiveauCarte): void {
  donnees.derniereDifficulte = { ferme, carte };
  ecrire();
}

export function retenirDuel(pseudo: string, salon: string): void {
  donnees.duel = { pseudo, salon };
  ecrire();
}

/** Résultat d'une partie terminée, tel que l'écran de fin doit l'annoncer. */
export interface Bilan {
  /** Vrai si cette partie bat le record de sa combinaison de difficulté. */
  record: boolean;
  /** Le record d'avant, pour le montrer à côté du résultat du jour. */
  precedent: Record | null;
}

/**
 * Enregistre une partie terminée et dit si elle bat le record.
 *
 * Le classement se fait d'abord sur la vague atteinte, puis sur le temps — une
 * victoire plus rapide vaut mieux qu'une victoire longue, et tenir une vague de
 * plus vaut mieux que tout le reste.
 */
export function enregistrerPartie(
  ferme: NiveauFerme,
  carte: NiveauCarte,
  resultat: { vague: number; chrono: number; victoire: boolean; ennemisTues: number; toursPosees: number },
): Bilan {
  donnees.parties++;
  if (resultat.victoire) donnees.victoires++;
  donnees.ennemisTues += resultat.ennemisTues;
  donnees.toursPosees += resultat.toursPosees;

  const cle = clePour(ferme, carte);
  const precedent = donnees.records[cle] ?? null;
  const meilleur =
    !precedent ||
    resultat.vague > precedent.vague ||
    (resultat.vague === precedent.vague &&
      resultat.victoire &&
      (!precedent.victoire || resultat.chrono < precedent.chrono));

  if (meilleur) {
    donnees.records[cle] = {
      vague: resultat.vague,
      chrono: resultat.chrono,
      victoire: resultat.victoire,
      quand: Date.now(),
    };
  }

  ecrire();
  return { record: meilleur && precedent !== null, precedent };
}

/** Efface tout. Réservé à un futur bouton « réinitialiser » du menu. */
export function toutEffacer(): void {
  donnees = vide();
  try {
    localStorage.removeItem(CLE);
  } catch {
    // Rien à faire : les données en mémoire sont déjà remises à zéro.
  }
}
