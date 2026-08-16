/**
 * Les quatre ressources de la zone farm, et la petite banque qui les stocke.
 *
 * Les âmes ne sont pas ici : elles ne se récoltent pas, elles tombent des ennemis
 * et servent uniquement aux upgrades. Elles vivent donc dans `Game`.
 */

export type TypeRessource = 'nourriture' | 'bois' | 'or' | 'pierre';

export const RESSOURCES: TypeRessource[] = ['nourriture', 'bois', 'or', 'pierre'];

export interface InfoRessource {
  nom: string;
  icone: string;
  couleur: string;
  /** À quoi elle sert, affiché en infobulle. */
  usage: string;
}

export const INFOS: Record<TypeRessource, InfoRessource> = {
  nourriture: {
    nom: 'Nourriture',
    icone: '🌾',
    couleur: '#ffe08a',
    usage: 'Élever des bébés animaux',
  },
  bois: { nom: 'Bois', icone: '🪵', couleur: '#d9a066', usage: 'Bâtiments de ferme et Coq' },
  or: { nom: 'Or', icone: '🪙', couleur: '#ffd166', usage: 'Construire les tours' },
  pierre: { nom: 'Pierre', icone: '🪨', couleur: '#b8c0d0', usage: 'Aigle et Entrepôt' },
};

/** Stock courant. Les valeurs sont fractionnaires : la récolte est continue. */
export type Banque = Record<TypeRessource, number>;

/** Prix exprimé en une ou plusieurs ressources. */
export type Cout = Partial<Record<TypeRessource, number>>;

export function banqueVide(): Banque {
  return { nourriture: 0, bois: 0, or: 0, pierre: 0 };
}

export function peutPayer(b: Banque, c: Cout): boolean {
  for (const r of RESSOURCES) {
    const du = c[r];
    if (du !== undefined && b[r] < du) return false;
  }
  return true;
}

export function payer(b: Banque, c: Cout): void {
  for (const r of RESSOURCES) {
    const du = c[r];
    if (du !== undefined) b[r] -= du;
  }
}

/** Fraction d'un coût, arrondie à l'entier inférieur (valeur de revente). */
export function fractionCout(c: Cout, f: number): Cout {
  const out: Cout = {};
  for (const r of RESSOURCES) {
    const du = c[r];
    if (du === undefined) continue;
    const n = Math.floor(du * f);
    if (n > 0) out[r] = n;
  }
  return out;
}

/**
 * Coût du n-ième exemplaire : `base × facteur^déjàPossédés`.
 *
 * Sans cette escalade, une ferme entièrement staffée produit bien plus que le jeu
 * ne peut absorber et le joueur spamme des dizaines de tours de niveau 1. Le prix
 * qui monte redonne du poids aux âmes (plafonnées par les kills) et transforme
 * l'expansion de la ferme en progression plutôt qu'en formalité.
 */
export function echelonner(c: Cout, dejaPossedes: number, facteur: number): Cout {
  const m = Math.pow(facteur, dejaPossedes);
  const out: Cout = {};
  for (const r of RESSOURCES) {
    const du = c[r];
    if (du !== undefined) out[r] = Math.round(du * m);
  }
  return out;
}

/** Applique un multiplicateur global (difficulté de la ferme). Jamais moins de 1. */
export function multiplierCout(c: Cout, m: number): Cout {
  if (m === 1) return c;
  const out: Cout = {};
  for (const r of RESSOURCES) {
    const du = c[r];
    if (du !== undefined) out[r] = Math.max(1, Math.round(du * m));
  }
  return out;
}

export function crediter(b: Banque, c: Cout): void {
  for (const r of RESSOURCES) {
    const n = c[r];
    if (n !== undefined) b[r] += n;
  }
}

/** Retire au plus `n` unités et renvoie ce qui a réellement pu être pris (pillage). */
export function piller(b: Banque, r: TypeRessource, n: number): number {
  const pris = Math.min(b[r], n);
  b[r] -= pris;
  return pris;
}

/** « 🪙 100 · 🪵 30 » */
export function formatCout(c: Cout): string {
  return RESSOURCES.filter((r) => c[r] !== undefined)
    .map((r) => `${INFOS[r].icone} ${c[r]}`)
    .join(' · ');
}
