import { gridToWorld, type Vec2 } from '../core/iso';
import { makeRng } from '../core/utils';
import { genererChemin, genererSpots, type Bande } from './mapgen';
import type { TypeRessource } from './resources';

/**
 * Une seule grille isométrique, en face à face.
 *
 *            gx 0…15      16       gx 17…37        38      gx 39…54
 *          ┌──────────┬────────┬───────────────┬────────┬──────────┐
 *  gy 0…11 │  FERME A │clôture │  DÉFENSE A ←  │clôture │          │
 *          │          │        ├───────────────┤        │  FERME B │
 * gy 12…23 │          │        │  DÉFENSE B →  │        │          │
 *          └──────────┴────────┴───────────────┴────────┴──────────┘
 *
 * La zone défense centrale est coupée en deux bandes horizontales, une par joueur.
 * Les ennemis entrent par le côté adverse et marchent vers le village du joueur,
 * adossé à sa ferme : chacun défend la voie qui protège sa propre économie.
 *
 * En solo, la carte s'arrête après la défense (une seule bande, une seule ferme).
 */

export const LARGEUR_FERME = 16;
export const LARGEUR_DEFENSE = 21;
/** Hauteur d'une bande de défense, en tuiles. */
export const HAUTEUR_BANDE = 12;

export const COL_CLOTURE_G = LARGEUR_FERME; // 16
export const COL_DEFENSE_MIN = COL_CLOTURE_G + 1; // 17
export const COL_DEFENSE_MAX = COL_DEFENSE_MIN + LARGEUR_DEFENSE - 1; // 37
export const COL_CLOTURE_D = COL_DEFENSE_MAX + 1; // 38
export const COL_FERME_B = COL_CLOTURE_D + 1; // 39

export type Joueur = 'a' | 'b';
export type Zone = 'ferme' | 'defense' | 'cloture';

export type TypeTuile =
  | 'herbe'
  | 'route'
  | 'entree'
  | 'sortie'
  | 'champ'
  | 'barriere';

/** Les tuiles que les ennemis empruntent (donc non constructibles). */
export function estChemin(t: TypeTuile | null): boolean {
  return t === 'route' || t === 'entree' || t === 'sortie';
}

export const AUTRE: Record<Joueur, Joueur> = { a: 'b', b: 'a' };

export type TypeDecor = 'arbre' | 'rocher' | 'buisson' | 'fleurs';

export interface Decor {
  gx: number;
  gy: number;
  type: TypeDecor;
  seed: number;
}

export interface SpotRessource {
  id: number;
  gx: number;
  gy: number;
  ressource: TypeRessource;
  seed: number;
  /** À quel joueur appartient ce spot. */
  joueur: Joueur;
  /** Id du bébé qui l'exploite, ou null s'il est libre. */
  occupePar: number | null;
}

export interface OptionsMap {
  graine: number;
  /** Nombre de segments du chemin sur le treillis (voir `mapgen.ts`). */
  segments: number;
  /** Densité de décor dans la zone utile : rareté des emplacements de tir. */
  encombrement: number;
  /** Nombre de spots de récolte à générer, par ressource et par joueur. */
  spots: Record<TypeRessource, number>;
  /** En duel, la carte comporte les deux fermes et les deux bandes. */
  duel: boolean;
}

export class GameMap {
  readonly duel: boolean;
  readonly largeur: number;
  readonly hauteur: number;
  readonly tuiles: TypeTuile[];
  readonly decors: Decor[] = [];
  readonly spots: SpotRessource[] = [];

  /** Sommets du chemin de chaque joueur. En solo, seul `a` est renseigné. */
  readonly chemins: Record<Joueur, Vec2[]> = { a: [], b: [] };
  private readonly cumuls: Record<Joueur, number[]> = { a: [], b: [] };
  readonly longueurs: Record<Joueur, number> = { a: 0, b: 0 };

  constructor(opts: OptionsMap) {
    const rng = makeRng(opts.graine);
    this.duel = opts.duel;
    this.largeur = opts.duel ? COL_FERME_B + LARGEUR_FERME : COL_DEFENSE_MAX + 1;
    this.hauteur = opts.duel ? HAUTEUR_BANDE * 2 : HAUTEUR_BANDE;
    this.tuiles = new Array(this.largeur * this.hauteur).fill('herbe');

    // Le joueur A défend la bande haute, en marchant vers sa ferme (à gauche).
    this.chemins.a = genererChemin(rng, opts.segments, this.bandeDe('a'));
    if (opts.duel) this.chemins.b = genererChemin(rng, opts.segments, this.bandeDe('b'));

    for (const j of this.joueurs) this.tracerChemin(j);
    this.poserClotures();
    this.poserSpots(rng, opts.spots);

    for (const j of this.joueurs) {
      let total = 0;
      const c = this.chemins[j];
      this.cumuls[j].push(0);
      for (let i = 1; i < c.length; i++) {
        total += Math.hypot(c[i].x - c[i - 1].x, c[i].y - c[i - 1].y);
        this.cumuls[j].push(total);
      }
      this.longueurs[j] = total;
    }

    this.semerDecor(rng, opts.encombrement);
  }

  get joueurs(): Joueur[] {
    return this.duel ? ['a', 'b'] : ['a'];
  }

  /** Étendue et sens de marche de la bande d'un joueur. */
  bandeDe(j: Joueur): Bande {
    return j === 'a'
      ? { xEntree: COL_DEFENSE_MAX, xSortie: COL_DEFENSE_MIN, y0: 0 }
      : { xEntree: COL_DEFENSE_MIN, xSortie: COL_DEFENSE_MAX, y0: HAUTEUR_BANDE };
  }

  zoneDe(gx: number): Zone {
    if (gx === COL_CLOTURE_G || gx === COL_CLOTURE_D) return 'cloture';
    if (gx < COL_CLOTURE_G || gx >= COL_FERME_B) return 'ferme';
    return 'defense';
  }

  /**
   * À qui appartient une tuile. Les fermes sont aux extrémités, les bandes de
   * défense se partagent le centre : haut pour A, bas pour B.
   */
  proprietaire(gx: number, gy: number): Joueur | null {
    if (!this.duel) return 'a';
    const zone = this.zoneDe(gx);
    if (zone === 'cloture') return null;
    if (zone === 'ferme') return gx < COL_CLOTURE_G ? 'a' : 'b';
    return gy < HAUTEUR_BANDE ? 'a' : 'b';
  }

  /** Rectangle de la ferme d'un joueur, restreint à la hauteur de sa propre bande. */
  rectFerme(j: Joueur): { x0: number; x1: number; y0: number; y1: number } {
    const y0 = this.duel && j === 'b' ? HAUTEUR_BANDE : 0;
    return j === 'a'
      ? { x0: 1, x1: COL_CLOTURE_G - 1, y0: y0 + 1, y1: y0 + HAUTEUR_BANDE - 2 }
      : {
          x0: COL_FERME_B,
          x1: this.largeur - 2,
          y0: y0 + 1,
          y1: y0 + HAUTEUR_BANDE - 2,
        };
  }

  private tracerChemin(j: Joueur): void {
    const sommets = this.chemins[j];
    for (let i = 1; i < sommets.length; i++) {
      const a = sommets[i - 1];
      const b = sommets[i];
      const pas = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
      let { x, y } = a;
      this.set(x, y, 'route');
      while (x !== b.x || y !== b.y) {
        x += pas.x;
        y += pas.y;
        this.set(x, y, 'route');
      }
    }
    this.set(sommets[0].x, sommets[0].y, 'entree');
    const s = sommets[sommets.length - 1];
    this.set(s.x, s.y, 'sortie');
  }

  private poserClotures(): void {
    for (let gy = 0; gy < this.hauteur; gy++) {
      this.set(COL_CLOTURE_G, gy, 'barriere');
      if (this.duel) this.set(COL_CLOTURE_D, gy, 'barriere');
    }
  }

  private poserSpots(rng: () => number, comptes: Record<TypeRessource, number>): void {
    let id = 1;
    for (const j of this.joueurs) {
      for (const p of genererSpots(rng, comptes, this.rectFerme(j))) {
        this.spots.push({
          id: id++,
          gx: p.gx,
          gy: p.gy,
          ressource: p.ressource,
          seed: rng(),
          joueur: j,
          occupePar: null,
        });
        if (p.ressource === 'nourriture') this.set(p.gx, p.gy, 'champ');
      }
    }
  }

  /**
   * Parsème l'herbe d'arbres et de rochers — décoratif, mais bloque la construction.
   *
   * L'encombrement s'applique à toute la **zone utile** (à portée de tir d'un chemin),
   * pas seulement aux cases mitoyennes. C'est indispensable : mesuré, un chemin court
   * ne rend pas la partie plus dure tout seul, parce que les mêmes tours en couvrent
   * une fraction bien plus grande — les deux effets s'annulent.
   */
  private semerDecor(rng: () => number, encombrement: number): void {
    const utile = this.zoneUtile();
    for (let gy = 0; gy < this.hauteur; gy++) {
      for (let gx = 0; gx < this.largeur; gx++) {
        if (this.at(gx, gy) !== 'herbe') continue;
        if (this.longeUnSpot(gx, gy)) continue; // place laissée aux bébés et aux bâtiments
        const r = rng();
        const dense =
          this.zoneDe(gx) === 'ferme'
            ? 0.09 // la ferme reste dégagée : on y construit tout le temps
            : utile[gy * this.largeur + gx]
              ? encombrement
              : 0.14;
        if (r > dense) continue;
        const type: TypeDecor =
          r < dense * 0.4
            ? 'arbre'
            : r < dense * 0.64
              ? 'buisson'
              : r < dense * 0.82
                ? 'rocher'
                : 'fleurs';
        this.decors.push({ gx, gy, type, seed: rng() });
      }
    }
  }

  /** Tuiles situées à portée de tir d'un chemin (rayon 3, la portée de base du Coq). */
  private zoneUtile(): boolean[] {
    const RAYON = 3;
    const utile = new Array<boolean>(this.largeur * this.hauteur).fill(false);
    for (const j of this.joueurs) {
      for (let d = 0; d <= this.longueurBrute(j); d += 0.5) {
        const p = this.pointSurChemin(j, d);
        const cx = Math.round(p.x);
        const cy = Math.round(p.y);
        for (let dy = -RAYON; dy <= RAYON; dy++) {
          for (let dx = -RAYON; dx <= RAYON; dx++) {
            if (Math.hypot(dx, dy) > RAYON) continue;
            const gx = cx + dx;
            const gy = cy + dy;
            if (this.dansLaMap(gx, gy)) utile[gy * this.largeur + gx] = true;
          }
        }
      }
    }
    return utile;
  }

  /** Longueur brute d'un chemin, utilisable avant que `longueurs` ne soit rempli. */
  private longueurBrute(j: Joueur): number {
    const c = this.chemins[j];
    let total = 0;
    for (let i = 1; i < c.length; i++) {
      total += Math.hypot(c[i].x - c[i - 1].x, c[i].y - c[i - 1].y);
    }
    return total;
  }

  private longeUnSpot(gx: number, gy: number): boolean {
    return this.spots.some((s) => Math.abs(s.gx - gx) <= 1 && Math.abs(s.gy - gy) <= 1);
  }

  private set(gx: number, gy: number, t: TypeTuile): void {
    if (this.dansLaMap(gx, gy)) this.tuiles[gy * this.largeur + gx] = t;
  }

  at(gx: number, gy: number): TypeTuile | null {
    return this.dansLaMap(gx, gy) ? this.tuiles[gy * this.largeur + gx] : null;
  }

  dansLaMap(gx: number, gy: number): boolean {
    return gx >= 0 && gy >= 0 && gx < this.largeur && gy < this.hauteur;
  }

  decorBloquant(gx: number, gy: number): boolean {
    return this.decors.some((d) => d.gx === gx && d.gy === gy && d.type !== 'fleurs');
  }

  spotEn(gx: number, gy: number): SpotRessource | null {
    return this.spots.find((s) => s.gx === gx && s.gy === gy) ?? null;
  }

  spotParId(id: number): SpotRessource | null {
    return this.spots.find((s) => s.id === id) ?? null;
  }

  spotsDe(j: Joueur): SpotRessource[] {
    return this.spots.filter((s) => s.joueur === j);
  }

  /** Tuile où `j` peut poser une tour : herbe libre, dans sa bande de défense. */
  constructibleTour(gx: number, gy: number, j: Joueur): boolean {
    return (
      this.at(gx, gy) === 'herbe' &&
      this.zoneDe(gx) === 'defense' &&
      this.proprietaire(gx, gy) === j &&
      !this.decorBloquant(gx, gy)
    );
  }

  /** Tuile où `j` peut poser un bâtiment : herbe libre, dans sa ferme, hors spot. */
  constructibleBatiment(gx: number, gy: number, j: Joueur): boolean {
    return (
      this.at(gx, gy) === 'herbe' &&
      this.zoneDe(gx) === 'ferme' &&
      this.proprietaire(gx, gy) === j &&
      !this.decorBloquant(gx, gy) &&
      this.spotEn(gx, gy) === null
    );
  }

  /** Position sur le chemin de `j` après avoir parcouru `d` tuiles depuis l'entrée. */
  pointSurChemin(j: Joueur, d: number): Vec2 {
    const sommets = this.chemins[j];
    const cumul = this.cumuls[j];
    if (!sommets.length) return { x: 0, y: 0 };
    const total = this.longueurs[j] || this.longueurBrute(j);
    if (d <= 0) return { ...sommets[0] };
    if (d >= total) return { ...sommets[sommets.length - 1] };
    if (!cumul.length) return { ...sommets[0] };
    let i = 1;
    while (i < cumul.length && cumul[i] < d) i++;
    const a = sommets[i - 1];
    const b = sommets[i];
    const seg = cumul[i] - cumul[i - 1];
    const t = seg === 0 ? 0 : (d - cumul[i - 1]) / seg;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  /** Centre en coordonnées monde de la ferme ou de la bande de défense d'un joueur. */
  centreZone(j: Joueur, zone: Zone): Vec2 {
    const y0 = this.duel && j === 'b' ? HAUTEUR_BANDE : 0;
    const cy = y0 + HAUTEUR_BANDE / 2 - 0.5;
    if (zone === 'defense') {
      return gridToWorld((COL_DEFENSE_MIN + COL_DEFENSE_MAX) / 2, cy);
    }
    const r = this.rectFerme(j);
    return gridToWorld((r.x0 + r.x1) / 2, cy);
  }

  /** Centre de toute la carte, pour la vue d'ensemble du duel. */
  centreCarte(): Vec2 {
    return gridToWorld((this.largeur - 1) / 2, (this.hauteur - 1) / 2);
  }
}
