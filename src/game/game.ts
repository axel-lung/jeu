import { Camera } from '../core/camera';
import { gridToWorld, worldToGrid } from '../core/iso';
import { clamp } from '../core/utils';
import { Effets } from './effects';
import {
  creerEnnemi,
  infligerDegats,
  majEnnemi,
  type Ennemi,
  type TypeEnnemi,
} from './enemies';
import {
  creerBatiment,
  creerBebe,
  DEFS_BATIMENTS,
  DEFS_BEBES,
  ENTRETIEN_PAR_BEBE,
  LIMITE_BEBES,
  tauxDe,
  type Batiment,
  type Bebe,
  type TypeBatiment,
  type TypeBebe,
} from './farm';
import { compter, DEFS_UNITES, type TypeUnite } from './army';
import {
  CARTES,
  FERMES,
  OPTIONS_DEFAUT,
  type Options,
  type ReglagesFerme,
} from './difficulty';
import { AUTRE, GameMap, type Joueur, type SpotRessource } from './map';
import { creerProjectile, majProjectile, pointVise, type Projectile } from './projectiles';
import {
  crediter,
  echelonner,
  fractionCout,
  INFOS,
  multiplierCout,
  payer,
  peutPayer,
  piller,
  type Banque,
  type Cout,
  type TypeRessource,
} from './resources';
import {
  bouche,
  choisirCible,
  creerTour,
  degatsContre,
  DEFS_TOURS,
  niveauActuel,
  ORDRE_CIBLES,
  prochainNiveau,
  valeurRevente,
  type Tour,
  type TypeTour,
} from './towers';
import { facteurPv, tailleVague, VAGUES } from './waves';
import { capturer, VueAdversaire, type Instantane } from '../net/snapshot';

/**
 * `menu` affiche la carte générée derrière l'écran de réglages ; `preparation`
 * est le compte à rebours avant la vague suivante — il n'y a plus de lancement
 * manuel, les vagues arrivent toutes seules.
 */
export type Phase = 'menu' | 'preparation' | 'vague' | 'victoire' | 'defaite';

/** En duel, la vitesse de jeu est verrouillée : les deux horloges doivent coïncider. */
export type Mode = 'solo' | 'duel';

/** Ce que la caméra regarde. En duel, on peut aussi observer le camp d'en face. */
export type Vue = 'ma-defense' | 'ma-ferme' | 'sa-defense' | 'sa-ferme';

/** Ce que le joueur s'apprête à poser. */
export type Outil =
  | { cat: 'tour'; type: TypeTour }
  | { cat: 'bebe'; type: TypeBebe }
  | { cat: 'batiment'; type: TypeBatiment };

/** Ce que le joueur a sélectionné sur la map. */
export type Selection =
  | { cat: 'tour'; tour: Tour }
  | { cat: 'bebe'; bebe: Bebe }
  | { cat: 'batiment'; batiment: Batiment };

// Assez de bois au départ pour deux Coqs (60) sans bloquer le premier bâtiment de
// ferme : sans cette marge, un joueur qui construit un camp trop tôt ne peut plus
// poser de tour et perd la vague 1 sans comprendre pourquoi.
const DEPART: Banque = { nourriture: 120, bois: 100, or: 250, pierre: 0 };
const VIES_DEPART = 100;

/** Répit avant la toute première vague : le temps de poser deux tours et un bébé. */
const ATTENTE_PREMIERE = 30;
/** Répit entre deux vagues. Calibré par simulation : voir le README. */
const ATTENTE_ENTRE = 20;

interface Apparition {
  type: TypeEnnemi;
  /** Instant d'apparition, en secondes depuis le début de la vague. */
  quand: number;
}

export class Game {
  /** Régénérée à chaque changement de réglages ou de graine. */
  map!: GameMap;
  readonly camera = new Camera();
  readonly effets = new Effets();

  options: Options = { ...OPTIONS_DEFAUT };

  ennemis: Ennemi[] = [];
  tours: Tour[] = [];
  projectiles: Projectile[] = [];
  bebes: Bebe[] = [];
  batiments: Batiment[] = [];

  mode: Mode = 'solo';
  /** Côté de la carte que l'on joue. En solo, toujours `a`. */
  moi: Joueur = 'a';
  /** File d'unités achetées, envoyée à l'adversaire au lancement de la vague. */
  armee: TypeUnite[] = [];
  /** Plateau adverse, reconstruit à partir de ses instantanés. */
  readonly vueAdverse = new VueAdversaire();

  /** Branchés par la couche réseau en duel ; nuls en solo. */
  onArmeeEnvoyee: ((unites: TypeUnite[]) => void) | null = null;
  onFinPartie: ((victoire: boolean) => void) | null = null;

  banque: Banque = { ...DEPART };
  ames = 0;
  vies = VIES_DEPART;

  /** Numéro de la vague en cours ou terminée (0 = aucune lancée). */
  vague = 0;
  phase: Phase = 'menu';
  vitesse = 1;
  /** Horloge d'animation. Tourne aussi dans le menu. */
  t = 0;
  /** Chronomètre de la partie, en secondes de jeu. Ne tourne que pendant la partie. */
  chrono = 0;

  /** Secondes restantes avant la vague suivante, et durée totale du répit en cours. */
  compteur = 0;
  attenteTotale = ATTENTE_PREMIERE;

  /** Ce que la caméra regarde. */
  vue: Vue = 'ma-defense';

  /** Zone *à soi* que la boutique doit proposer. */
  get zoneActive(): 'defense' | 'ferme' {
    return this.vue === 'ma-ferme' ? 'ferme' : 'defense';
  }

  get lui(): Joueur {
    return AUTRE[this.moi];
  }

  selection: Selection | null = null;
  outil: Outil | null = null;
  /** Tuile survolée par la souris, ou null si le curseur est hors map. */
  survol: { gx: number; gy: number } | null = null;

  /** Bandeau d'annonce : texte + temps restant. */
  bandeau: { texte: string; boss: boolean; vie: number } | null = null;

  private apparitions: Apparition[] = [];
  private prochaineApparition = 0;
  private tempsVague = 0;
  /** Renforts envoyés par l'adversaire, datés sur le chronomètre de la partie. */
  private renforts: { type: TypeEnnemi; quand: number }[] = [];

  constructor() {
    this.previsualiser({});
  }

  /* ---------------------------------------------------------------- */
  /*  Cycle de vie                                                     */
  /* ---------------------------------------------------------------- */

  get reglagesFerme(): ReglagesFerme {
    return FERMES[this.options.ferme];
  }

  /** Facteur de PV appliqué à tout ce qui apparaît : montée par vague × pression de carte. */
  private facteurPvCourant(): number {
    return facteurPv(Math.max(1, this.vague)) * CARTES[this.options.carte].pression;
  }

  /**
   * Régénère la carte avec de nouveaux réglages et retourne au menu.
   * La carte reste visible derrière l'écran de réglages : changer de difficulté
   * ou relancer la graine met à jour l'aperçu tout de suite.
   */
  previsualiser(partiel: Partial<Options>, duel = this.mode === 'duel'): void {
    this.options = { ...this.options, ...partiel };
    this.map = new GameMap({
      graine: this.options.graine,
      segments: CARTES[this.options.carte].segments,
      encombrement: CARTES[this.options.carte].encombrement,
      spots: this.reglagesFerme.spots,
      duel,
    });
    this.reinitialiser();
    this.phase = 'menu';
    this.vue = 'ma-defense';
    const c = duel ? this.map.centreCarte() : this.map.centreZone(this.moi, 'defense');
    this.camera.centrerSur(c.x, c.y);
  }

  /** Lance la partie sur la carte actuellement affichée. */
  demarrer(mode: Mode = 'solo', moi: Joueur = 'a'): void {
    this.mode = mode;
    this.moi = moi;
    // La carte doit correspondre au mode : solo = une seule ferme et une seule bande.
    if (this.map.duel !== (mode === 'duel')) this.previsualiser({}, mode === 'duel');
    this.reinitialiser();
    this.phase = 'preparation';
    this.allerA('ma-defense');
    this.compteur = ATTENTE_PREMIERE;
    this.attenteTotale = ATTENTE_PREMIERE;
    this.bandeau = { texte: 'Préparez la défense !', boss: false, vie: 2.6 };
  }

  /** Rejoue la même carte avec les mêmes réglages. */
  rejouer(): void {
    this.demarrer(this.mode);
  }

  retourMenu(): void {
    this.previsualiser({});
  }

  /** Remet la partie à zéro sans toucher à la carte ni aux réglages. */
  private reinitialiser(): void {
    this.ennemis = [];
    this.tours = [];
    this.projectiles = [];
    this.bebes = [];
    this.batiments = [];
    this.armee = [];
    this.renforts = [];
    this.vueAdverse.vider();
    for (const s of this.map.spots) s.occupePar = null;
    this.effets.vider();

    const depart = this.reglagesFerme.depart;
    this.banque = {
      nourriture: Math.round(DEPART.nourriture * depart),
      bois: Math.round(DEPART.bois * depart),
      or: Math.round(DEPART.or * depart),
      pierre: Math.round(DEPART.pierre * depart),
    };
    this.ames = 0;
    this.vies = VIES_DEPART;
    this.vague = 0;
    this.vitesse = 1;
    this.chrono = 0;
    this.compteur = 0;
    this.selection = null;
    this.outil = null;
    this.apparitions = [];
    this.prochaineApparition = 0;
    this.tempsVague = 0;
    this.bandeau = null;
  }

  get vagueTotale(): number {
    return VAGUES.length;
  }

  private lancerVague(): void {
    if (this.phase !== 'preparation' || this.vague >= VAGUES.length) return;
    this.vague++;
    const v = VAGUES[this.vague - 1];

    // On aplatit les groupes en une liste d'apparitions triée par instant.
    this.apparitions = [];
    for (const g of v.groupes) {
      for (let i = 0; i < g.nombre; i++) {
        this.apparitions.push({ type: g.type, quand: g.attente + i * g.intervalle });
      }
    }
    this.apparitions.sort((a, b) => a.quand - b.quand);
    this.prochaineApparition = 0;
    this.tempsVague = 0;
    this.phase = 'vague';

    // L'armée préparée part maintenant : elle arrivera sur le chemin d'en face,
    // que l'on voit puisque toute la carte est partagée.
    if (this.armee.length) {
      const envoi = [...this.armee];
      this.armee = [];
      this.onArmeeEnvoyee?.(envoi);
    }

    this.bandeau = {
      texte: v.boss ? `⚔ ${v.nom}` : `Vague ${this.vague} — ${v.nom} (${tailleVague(v)})`,
      boss: v.boss,
      vie: 2.4,
    };
  }

  basculerVitesse(): void {
    // En duel les deux parties tournent en parallèle : accélérer chez soi
    // décalerait les vagues et rendrait les envois incohérents.
    if (this.mode === 'duel') return;
    this.vitesse = this.vitesse === 1 ? 2 : this.vitesse === 2 ? 3 : 1;
  }

  /* ---------------------------------------------------------------- */
  /*  Armée : ce qu'on prépare et ce qu'on reçoit                      */
  /* ---------------------------------------------------------------- */

  coutUnite(type: TypeUnite): Cout {
    return multiplierCout(DEFS_UNITES[type].cout, this.reglagesFerme.couts);
  }

  /** Ajoute une unité à la file d'envoi. Payée tout de suite. */
  enroler(type: TypeUnite): boolean {
    const cout = this.coutUnite(type);
    if (!peutPayer(this.banque, cout)) return false;
    payer(this.banque, cout);
    this.armee.push(type);
    return true;
  }

  /** Retire la dernière unité de ce type et rembourse intégralement. */
  desenroler(type: TypeUnite): void {
    const i = this.armee.lastIndexOf(type);
    if (i < 0) return;
    this.armee.splice(i, 1);
    crediter(this.banque, this.coutUnite(type));
  }

  effectifArmee(): Record<TypeUnite, number> {
    return compter(this.armee);
  }

  /**
   * Renforts envoyés par l'adversaire : ils rejoignent le chemin de défense
   * quelques secondes plus tard, mêlés à la vague en cours.
   */
  recevoirArmee(unites: TypeUnite[]): void {
    if (!unites.length) return;
    let quand = this.chrono + 3;
    for (const u of unites) {
      this.renforts.push({ type: DEFS_UNITES[u].ennemi, quand });
      quand += 0.45;
    }
    this.renforts.sort((a, b) => a.quand - b.quand);
    this.bandeau = {
      texte: `⚠ Assaut adverse : ${unites.length} unités !`,
      boss: true,
      vie: 2.4,
    };
  }

  allerA(vue: Vue): void {
    // Le camp d'en face n'existe qu'en duel.
    if (!this.map.duel && (vue === 'sa-defense' || vue === 'sa-ferme')) vue = 'ma-defense';
    this.vue = vue;
    const joueur = vue.startsWith('ma') ? this.moi : this.lui;
    const zone = vue.endsWith('ferme') ? 'ferme' : 'defense';
    const c = this.map.centreZone(joueur, zone);
    this.camera.viser(c.x, c.y);
  }

  /** Tab fait le tour des vues : chez moi, puis chez lui si l'on est en duel. */
  basculerZone(): void {
    const cycle: Vue[] = this.map.duel
      ? ['ma-defense', 'ma-ferme', 'sa-defense', 'sa-ferme']
      : ['ma-defense', 'ma-ferme'];
    const i = cycle.indexOf(this.vue);
    this.allerA(cycle[(i + 1) % cycle.length]);
  }

  /* ---------------------------------------------------------------- */
  /*  Construction                                                     */
  /* ---------------------------------------------------------------- */

  tourEn(gx: number, gy: number): Tour | null {
    return this.tours.find((t) => t.gx === gx && t.gy === gy) ?? null;
  }

  batimentEn(gx: number, gy: number): Batiment | null {
    return this.batiments.find((b) => b.gx === gx && b.gy === gy) ?? null;
  }

  bebeEn(gx: number, gy: number): Bebe | null {
    return this.bebes.find((b) => b.gx === gx && b.gy === gy) ?? null;
  }

  /**
   * Prix courant de l'outil. Chaque exemplaire supplémentaire coûte plus cher que
   * le précédent : c'est ce qui empêche une ferme mature de financer une forêt de
   * tours de niveau 1, et qui garde les upgrades (payées en âmes) compétitives.
   */
  coutOutil(o: Outil): Cout {
    const base = (() => {
      switch (o.cat) {
        case 'tour':
          return echelonner(
            DEFS_TOURS[o.type].cout,
            this.tours.filter((t) => t.type === o.type).length,
            1.13,
          );
        case 'bebe':
          return echelonner(DEFS_BEBES[o.type].cout, this.bebes.length, 1.1);
        case 'batiment':
          return echelonner(
            DEFS_BATIMENTS[o.type].cout,
            this.batiments.filter((b) => b.type === o.type).length,
            1.3,
          );
      }
    })();
    return multiplierCout(base, this.reglagesFerme.couts);
  }

  /** Vrai si l'outil peut être posé sur cette tuile, prix compris. */
  posableSur(o: Outil, gx: number, gy: number): boolean {
    if (!peutPayer(this.banque, this.coutOutil(o))) return false;
    switch (o.cat) {
      case 'tour':
        return this.map.constructibleTour(gx, gy, this.moi) && this.tourEn(gx, gy) === null;
      case 'batiment':
        return (
          this.map.constructibleBatiment(gx, gy, this.moi) && this.batimentEn(gx, gy) === null
        );
      case 'bebe': {
        const spot = this.map.spotEn(gx, gy);
        return (
          spot !== null &&
          spot.joueur === this.moi &&
          spot.occupePar === null &&
          this.bebes.length < LIMITE_BEBES
        );
      }
    }
  }

  /** Pose l'outil. Renvoie true si quelque chose a été construit. */
  poser(o: Outil, gx: number, gy: number): boolean {
    if (!this.posableSur(o, gx, gy)) return false;
    const paye = this.coutOutil(o);
    payer(this.banque, paye);
    const w = gridToWorld(gx, gy);

    switch (o.cat) {
      case 'tour': {
        const t = creerTour(o.type, gx, gy, paye);
        this.tours.push(t);
        this.selection = { cat: 'tour', tour: t };
        this.effets.confettis(w.x, w.y, 10, 10, 0.7);
        break;
      }
      case 'batiment': {
        const b = creerBatiment(o.type, gx, gy, paye);
        this.batiments.push(b);
        this.selection = { cat: 'batiment', batiment: b };
        this.effets.confettis(w.x, w.y, 14, 12, 0.8);
        break;
      }
      case 'bebe': {
        const spot = this.map.spotEn(gx, gy);
        if (!spot) return false;
        const b = creerBebe(o.type, spot, paye);
        spot.occupePar = b.id;
        this.bebes.push(b);
        this.selection = { cat: 'bebe', bebe: b };
        this.effets.confettis(w.x, w.y, 14, 10, 0.6);
        break;
      }
    }
    return true;
  }

  ameliorer(t: Tour): boolean {
    const suivant = prochainNiveau(t);
    if (!suivant || this.ames < suivant.coutAmes) return false;
    this.ames -= suivant.coutAmes;
    t.niveau++;
    const w = gridToWorld(t.gx, t.gy);
    this.effets.confettis(w.x, w.y, 30, 18, 1.1);
    this.effets.texte(w.x, w.y, 40, suivant.titre, '#ffd166');
    return true;
  }

  vendreTour(t: Tour): void {
    const rendu = valeurRevente(t);
    crediter(this.banque, rendu);
    this.tours = this.tours.filter((x) => x.id !== t.id);
    if (this.selection?.cat === 'tour' && this.selection.tour.id === t.id) this.selection = null;
    this.texteRemboursement(t.gx, t.gy, rendu);
  }

  vendreBatiment(b: Batiment): void {
    const rendu = fractionCout(b.paye, 0.7);
    crediter(this.banque, rendu);
    this.batiments = this.batiments.filter((x) => x.id !== b.id);
    if (this.selection?.cat === 'batiment' && this.selection.batiment.id === b.id) {
      this.selection = null;
    }
    this.texteRemboursement(b.gx, b.gy, rendu);
  }

  /** Renvoie un bébé : le spot redevient libre et la moitié de la nourriture revient. */
  renvoyerBebe(b: Bebe): void {
    const spot = this.map.spotParId(b.spotId);
    if (spot) spot.occupePar = null;
    const rendu = fractionCout(b.paye, 0.5);
    crediter(this.banque, rendu);
    this.bebes = this.bebes.filter((x) => x.id !== b.id);
    if (this.selection?.cat === 'bebe' && this.selection.bebe.id === b.id) this.selection = null;
    this.texteRemboursement(b.gx, b.gy, rendu);
  }

  private texteRemboursement(gx: number, gy: number, rendu: Cout): void {
    const w = gridToWorld(gx, gy);
    let dz = 26;
    for (const [r, n] of Object.entries(rendu)) {
      const info = INFOS[r as keyof typeof INFOS];
      this.effets.texte(w.x, w.y, dz, `+${n} ${info.icone}`, info.couleur);
      dz += 16;
    }
  }

  cyclerCible(t: Tour): void {
    const i = ORDRE_CIBLES.indexOf(t.mode);
    t.mode = ORDRE_CIBLES[(i + 1) % ORDRE_CIBLES.length];
  }

  /* ---------------------------------------------------------------- */
  /*  Interactions souris                                              */
  /* ---------------------------------------------------------------- */

  /** Convertit une position écran en tuile, ou null si hors de la map. */
  tuileSous(sx: number, sy: number): { gx: number; gy: number } | null {
    const w = this.camera.screenToWorld(sx, sy);
    const g = worldToGrid(w.x, w.y);
    const gx = Math.round(g.x);
    const gy = Math.round(g.y);
    return this.map.dansLaMap(gx, gy) ? { gx, gy } : null;
  }

  clicGauche(sx: number, sy: number): void {
    if (this.phase !== 'preparation' && this.phase !== 'vague') return;
    const tuile = this.tuileSous(sx, sy);
    if (!tuile) return;

    if (this.outil) {
      const o = this.outil;
      if (this.poser(o, tuile.gx, tuile.gy)) {
        // On garde l'outil actif tant que le joueur peut encore s'offrir le même.
        if (!peutPayer(this.banque, this.coutOutil(o))) this.outil = null;
      }
      return;
    }

    const tour = this.tourEn(tuile.gx, tuile.gy);
    if (tour) {
      this.selection = { cat: 'tour', tour };
      return;
    }
    const bebe = this.bebeEn(tuile.gx, tuile.gy);
    if (bebe) {
      this.selection = { cat: 'bebe', bebe };
      return;
    }
    const batiment = this.batimentEn(tuile.gx, tuile.gy);
    this.selection = batiment ? { cat: 'batiment', batiment } : null;
  }

  clicDroit(): void {
    if (this.outil) this.outil = null;
    else this.selection = null;
  }

  /* ---------------------------------------------------------------- */
  /*  Boucle de simulation                                             */
  /* ---------------------------------------------------------------- */

  maj(dtReel: number, sourisX: number, sourisY: number, sourisSurCanvas: boolean): void {
    this.camera.update(dtReel);
    this.survol = sourisSurCanvas ? this.tuileSous(sourisX, sourisY) : null;

    if (this.bandeau) {
      this.bandeau.vie -= dtReel;
      if (this.bandeau.vie <= 0) this.bandeau = null;
    }

    // Dans le menu et sur les écrans de fin, seules les animations continuent.
    if (this.phase !== 'preparation' && this.phase !== 'vague') {
      this.t += dtReel;
      this.effets.maj(dtReel);
      return;
    }

    // La vitesse de jeu est appliquée en sous-pas pour garder la simulation stable
    // (sinon, en ×3, un projectile rapide peut traverser sa cible en une frame).
    const dtJeu = dtReel * this.vitesse;
    const pas = Math.ceil(dtJeu / 0.02);
    const dt = dtJeu / pas;
    for (let i = 0; i < pas; i++) this.pasDeSimulation(dt);

    this.effets.maj(dtJeu);
  }

  private pasDeSimulation(dt: number): void {
    this.t += dt;
    this.chrono += dt;

    if (this.phase === 'preparation') {
      // Les vagues partent toutes seules : le répit n'est qu'un compte à rebours.
      this.compteur -= dt;
      if (this.compteur <= 0) this.lancerVague();
    }
    if (this.phase === 'vague') {
      this.tempsVague += dt;
      this.faireApparaitre();
    }
    this.majFerme(dt);
    this.majRenforts();
    this.majEnnemis(dt);
    this.majTours(dt);
    this.majProjectiles(dt);
    this.verifierFinDeVague();
  }

  /** La ferme produit en continu, y compris entre les vagues. */
  private majFerme(dt: number): void {
    for (const b of this.batiments) b.t += dt;

    let bouches = 0;
    for (const b of this.bebes) {
      b.t += dt;
      if (b.eclosion > 0) {
        b.eclosion = Math.max(0, b.eclosion - dt);
        if (b.eclosion === 0) {
          const w = gridToWorld(b.gx, b.gy);
          this.effets.confettis(w.x, w.y, 14, 10, 0.6);
        }
        continue;
      }
      bouches++;
      const spot = this.map.spotParId(b.spotId);
      if (!spot) continue;

      const gain = tauxDe(spot, b, this.batiments) * dt;
      this.banque[spot.ressource] += gain;
      b.produit += gain;
      b.tampon += gain;

      // Un chiffre qui remonte tous les 10 points récoltés : lisible sans spammer.
      if (b.tampon >= 10) {
        b.tampon -= 10;
        const w = gridToWorld(b.gx, b.gy);
        const info = INFOS[spot.ressource];
        this.effets.texte(w.x, w.y, 26, `+10 ${info.icone}`, info.couleur);
      }
    }

    // Entretien : chaque bébé éclos mange. Un déficit plafonne le stock à zéro
    // plutôt que de déclencher une famine — pas de spirale de la mort ici.
    const conso = bouches * ENTRETIEN_PAR_BEBE * dt;
    this.banque.nourriture = Math.max(0, this.banque.nourriture - conso);
  }

  /** Fait entrer les renforts adverses dont l'heure est venue. */
  private majRenforts(): void {
    while (this.renforts.length && this.renforts[0].quand <= this.chrono) {
      const r = this.renforts.shift();
      if (!r) break;
      // Ils encaissent la mise à l'échelle de la vague courante, comme le reste.
      this.ennemis.push(creerEnnemi(r.type, this.facteurPvCourant(), true));
    }
  }

  private faireApparaitre(): void {
    const fpv = this.facteurPvCourant();
    while (
      this.prochaineApparition < this.apparitions.length &&
      this.apparitions[this.prochaineApparition].quand <= this.tempsVague
    ) {
      const a = this.apparitions[this.prochaineApparition++];
      this.ennemis.push(creerEnnemi(a.type, fpv));
    }
  }

  private majEnnemis(dt: number): void {
    for (let i = this.ennemis.length - 1; i >= 0; i--) {
      const e = this.ennemis[i];
      if (!e.vivant) {
        this.ennemis.splice(i, 1);
        continue;
      }
      const sorti = majEnnemi(e, dt, this.map, this.moi);
      if (sorti) {
        this.fuite(e);
        this.ennemis.splice(i, 1);
      }
    }
  }

  /** Un ennemi a atteint la sortie : il coûte des vies et repart avec du butin. */
  private fuite(e: Ennemi): void {
    this.vies -= e.def.degatsVies;
    const vole = piller(this.banque, e.def.pillage.ressource, e.def.pillage.quantite);

    const w = gridToWorld(e.gx, e.gy);
    this.effets.texte(w.x, w.y, 30, `-${e.def.degatsVies} ❤`, '#ff7b8a');
    if (vole > 0) {
      const info = INFOS[e.def.pillage.ressource];
      this.effets.texte(w.x + 16, w.y, 46, `-${Math.round(vole)} ${info.icone}`, info.couleur);
    }

    if (this.vies <= 0) {
      this.vies = 0;
      this.terminer(false);
    }
  }

  /** Fin de partie locale. En duel, c'est le serveur qui tranche ensuite. */
  private terminer(victoire: boolean): void {
    this.phase = victoire ? 'victoire' : 'defaite';
    this.onFinPartie?.(victoire);
  }

  /** Fin imposée par le serveur (l'adversaire est tombé ou a quitté). */
  terminerDepuisReseau(victoire: boolean): void {
    if (this.phase !== 'preparation' && this.phase !== 'vague') return;
    this.phase = victoire ? 'victoire' : 'defaite';
  }

  private majTours(dt: number): void {
    for (const t of this.tours) {
      t.t += dt;
      t.recul = Math.max(0, t.recul - dt * 6);
      t.recharge -= dt;

      const cible = choisirCible(t, this.ennemis);
      if (!cible) continue;

      // La tour s'oriente vers sa cible même si elle recharge.
      const wt = gridToWorld(t.gx, t.gy);
      const wc = gridToWorld(cible.gx, cible.gy);
      t.angle = Math.atan2(wc.y - wt.y, wc.x - wt.x);

      if (t.recharge > 0) continue;
      const n = niveauActuel(t);
      t.recharge = 1 / n.cadence;
      t.recul = 1;

      this.projectiles.push(
        creerProjectile(bouche(t), cible, {
          type: t.type === 'coq' ? 'pic' : 'eclair',
          tourId: t.id,
          degats: degatsContre(t, cible),
          vitesse: t.def.vitesseProjectile,
          couleur: t.def.couleur,
          aoe: n.aoe,
          chaine: n.chaine,
        }),
      );
    }
  }

  private majProjectiles(dt: number): void {
    const index = new Map<number, Ennemi>();
    for (const e of this.ennemis) index.set(e.id, e);

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const touche = majProjectile(p, dt, index);
      if (touche) this.resoudreImpact(p, touche, index);
      if (!p.vivant) this.projectiles.splice(i, 1);
    }
  }

  private resoudreImpact(p: Projectile, cible: Ennemi, index: Map<number, Ennemi>): void {
    const pt = pointVise(cible);
    this.effets.impact(pt.x, pt.y, pt.z, p.couleur);

    if (infligerDegats(cible, p.degats)) this.tuer(cible, p.tourId);

    // Coq niveau 4 : gerbe de confettis qui touche tout ce qui est autour.
    if (p.aoe > 0) {
      const wr = p.aoe * 32; // rayon converti en pixels monde, pour l'anneau visuel
      this.effets.explosion(pt.x, pt.y, pt.z, wr);
      for (const e of this.ennemis) {
        if (!e.vivant || e.id === cible.id || e.def.volant) continue;
        if (Math.hypot(e.gx - cible.gx, e.gy - cible.gy) > p.aoe) continue;
        if (infligerDegats(e, p.degats * 0.6)) this.tuer(e, p.tourId);
      }
    }

    // Aigle niveau 4 : l'éclair rebondit sur les voisins non encore touchés.
    if (p.chaine > 0) {
      let reste = p.chaine;
      const touches = [...p.dejaTouches];
      for (const e of this.ennemis) {
        if (reste <= 0) break;
        if (!e.vivant || touches.includes(e.id)) continue;
        if (Math.hypot(e.gx - cible.gx, e.gy - cible.gy) > 2.5) continue;
        touches.push(e.id);
        reste--;
        this.projectiles.push(
          creerProjectile(pt, e, {
            type: 'eclair',
            tourId: p.tourId,
            degats: p.degats * 0.5,
            vitesse: 900,
            couleur: '#8cdcff',
            chaine: 0,
            dejaTouches: touches,
          }),
        );
      }
    }

    index.delete(cible.id);
  }

  private tuer(e: Ennemi, tourId: number): void {
    const w = gridToWorld(e.gx, e.gy);
    const z = e.z + e.def.taille;

    this.ames += e.def.ames;
    this.banque.or += e.def.or;

    this.effets.pop(w.x, w.y, z, e.def.boss ? 26 : 7);
    this.effets.confettis(w.x, w.y, z, e.def.boss ? 60 : 12, e.def.boss ? 2 : 1);
    this.effets.texte(w.x, w.y, z, `+${e.def.ames} 👻`, '#c9a7ff');

    const tour = this.tours.find((t) => t.id === tourId);
    if (tour) tour.kills++;

    // Le Titan libère une poignée de Goblinets en éclatant (cf. document de design).
    if (e.type === 'titan') {
      for (let i = 0; i < 3; i++) {
        const petit = creerEnnemi('goblinet', this.facteurPvCourant());
        petit.parcours = Math.max(0, e.parcours - i * 0.6);
        this.ennemis.push(petit);
      }
    }
  }

  private verifierFinDeVague(): void {
    if (this.phase !== 'vague') return;
    if (this.prochaineApparition < this.apparitions.length) return;
    if (this.ennemis.length > 0) return;

    const v = VAGUES[this.vague - 1];
    this.banque.or += v.recompense;
    this.vitesse = 1;

    if (this.vague >= VAGUES.length) {
      this.terminer(true);
      return;
    }
    this.phase = 'preparation';

    {
      this.compteur = ATTENTE_ENTRE;
      this.attenteTotale = ATTENTE_ENTRE;
      this.bandeau = {
        texte: `Vague ${this.vague} tenue ! +${v.recompense} 🪙`,
        boss: false,
        vie: 2,
      };
    }
  }

  /**
   * Avancement à afficher dans la barre de progression :
   * le remplissage du répit pendant l'attente, la part de vague écoulée pendant l'assaut.
   */
  progression(): number {
    if (this.phase === 'preparation') {
      return this.attenteTotale <= 0 ? 0 : 1 - this.compteur / this.attenteTotale;
    }
    if (this.phase !== 'vague' || this.apparitions.length === 0) return 0;
    const apparus = this.prochaineApparition / this.apparitions.length;
    const restants = this.ennemis.length;
    return Math.min(1, apparus * 0.75 + (restants === 0 ? 0.25 : 0));
  }

  /* ---------------------------------------------------------------- */
  /*  Vue d'ensemble de la ferme, pour le HUD                          */
  /* ---------------------------------------------------------------- */

  /** Production nette par seconde, entretien des bébés déduit de la nourriture. */
  productionParSeconde(): Record<TypeRessource, number> {
    const out: Record<TypeRessource, number> = { nourriture: 0, bois: 0, or: 0, pierre: 0 };
    for (const b of this.bebes) {
      const spot = this.map.spotParId(b.spotId);
      if (!spot) continue;
      out[spot.ressource] += tauxDe(spot, b, this.batiments);
      if (b.eclosion <= 0) out.nourriture -= ENTRETIEN_PAR_BEBE;
    }
    return out;
  }

  spotDuBebe(b: Bebe): SpotRessource | null {
    return this.map.spotParId(b.spotId);
  }

  /** Photo de son propre plateau, publiée à l'adversaire. */
  instantane(): Instantane {
    return capturer(this);
  }

  /* ---------------------------------------------------------------- */
  /*  Caméra clavier                                                   */
  /* ---------------------------------------------------------------- */

  panClavier(dx: number, dy: number, dt: number): void {
    const v = 620 * dt;
    this.camera.panWorld(dx * v, dy * v);
    // On borde le déplacement autour du centre de la carte entière.
    const c = this.map.centreCarte();
    const limite = 1800;
    this.camera.x = clamp(this.camera.x, c.x - limite, c.x + limite);
    this.camera.y = clamp(this.camera.y, c.y - limite, c.y + limite);

    // La vue « active » suit la caméra, pour que la boutique reste cohérente.
    const g = worldToGrid(this.camera.x, this.camera.y);
    const gx = Math.round(g.x);
    const gy = Math.round(g.y);
    if (!this.map.dansLaMap(gx, gy)) return;
    const proprio = this.map.proprietaire(gx, gy);
    const zone = this.map.zoneDe(gx);
    if (zone === 'cloture' || proprio === null) return;
    const mien = proprio === this.moi;
    this.vue = zone === 'ferme' ? (mien ? 'ma-ferme' : 'sa-ferme') : mien ? 'ma-defense' : 'sa-defense';
  }
}
