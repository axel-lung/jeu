import { gridToWorld, pathTile, TILE_H, TILE_W } from '../core/iso';
import { makeRng, roundRect } from '../core/utils';
import type { Game, Outil } from '../game/game';
import type { Ennemi } from '../game/enemies';
import { couvre, DEFS_BATIMENTS, DEFS_BEBES, type Batiment, type Bebe } from '../game/farm';
import { DEFS_TOURS, niveauActuel, type Tour, type TypeTour } from '../game/towers';
import type { Projectile } from '../game/projectiles';
import {
  COL_CLOTURE_D,
  COL_CLOTURE_G,
  estChemin,
  type Joueur,
  type SpotRessource,
} from '../game/map';
import type { InstEnnemi, Instantane } from '../net/snapshot';
import {
  dessinerBarriere,
  dessinerBatiment,
  dessinerBebe,
  dessinerOeuf,
  dessinerSpot,
} from './farmSprites';
import {
  dessinerAigle,
  dessinerBat,
  dessinerBunny,
  dessinerCoq,
  dessinerDecor,
  dessinerGoblinet,
  dessinerTitan,
  etoile,
  ombre,
} from './sprites';

/** Un élément à trier en profondeur avant dessin. */
interface Calque {
  profondeur: number;
  dessiner: () => void;
}

/** Au-delà de ce rayon, on ne dessine pas le cercle d'effet (cas de l'Entrepôt, global). */
const RAYON_MAX_AFFICHE = 8;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private teintes: number[] = [];
  /** Taille de carte pour laquelle les teintes ont été tirées. */
  private tailleTeintes = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly game: Game,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Contexte 2D indisponible');
    this.ctx = ctx;
  }

  /** La carte change de taille entre solo et duel : on retire les teintes au besoin. */
  private assurerTeintes(): void {
    const n = this.game.map.largeur * this.game.map.hauteur;
    if (this.tailleTeintes === n) return;
    const rng = makeRng(20250816);
    this.teintes = new Array(n);
    for (let i = 0; i < n; i++) this.teintes[i] = rng();
    this.tailleTeintes = n;
  }

  redimensionner(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.game.camera.viewW = w;
    this.game.camera.viewH = h;
  }

  /** Rectangle monde visible, avec une marge pour les sprites hauts. */
  private cadre(): { x0: number; y0: number; x1: number; y1: number } {
    const cam = this.game.camera;
    const a = cam.screenToWorld(0, 0);
    const b = cam.screenToWorld(cam.viewW, cam.viewH);
    const marge = 90;
    return { x0: a.x - marge, y0: a.y - marge, x1: b.x + marge, y1: b.y + marge };
  }

  dessiner(): void {
    const { ctx, game } = this;
    this.assurerTeintes();
    const dpr = this.canvas.width / Math.max(1, this.canvas.clientWidth);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.fond();

    ctx.save();
    game.camera.applyTo(ctx);

    const vue = this.cadre();
    const dedans = (wx: number, wy: number): boolean =>
      wx >= vue.x0 && wx <= vue.x1 && wy >= vue.y0 && wy <= vue.y1;

    this.sol(dedans);
    this.marqueurs();
    this.aidesDePlacement();

    const calques: Calque[] = [];
    const ajouter = (gx: number, gy: number, dessiner: () => void): void => {
      const w = gridToWorld(gx, gy);
      if (!dedans(w.x, w.y)) return;
      calques.push({ profondeur: w.y, dessiner });
    };

    // Clôtures : une à gauche de la défense, une à droite en duel.
    const colonnes = game.map.duel ? [COL_CLOTURE_G, COL_CLOTURE_D] : [COL_CLOTURE_G];
    for (const cx of colonnes) {
      for (let gy = 0; gy < game.map.hauteur; gy++) {
        const w = gridToWorld(cx, gy);
        ajouter(cx, gy, () => dessinerBarriere(ctx, w.x, w.y));
      }
    }
    for (const d of game.map.decors) {
      const w = gridToWorld(d.gx, d.gy);
      ajouter(d.gx, d.gy, () => dessinerDecor(ctx, w.x, w.y, d.type, d.seed, game.t));
    }
    for (const s of game.map.spots) {
      const w = gridToWorld(s.gx, s.gy);
      ajouter(s.gx, s.gy, () => dessinerSpot(ctx, w.x, w.y, s.ressource, s.seed, game.t));
    }

    // Mon plateau, simulé localement.
    for (const b of game.batiments) {
      const w = gridToWorld(b.gx, b.gy);
      ajouter(b.gx, b.gy, () => this.batiment(b, w.x, w.y));
    }
    for (const b of game.bebes) {
      const w = gridToWorld(b.gx, b.gy);
      ajouter(b.gx, b.gy, () => this.bebe(b, w.x, w.y));
    }
    for (const t of game.tours) {
      const w = gridToWorld(t.gx, t.gy);
      ajouter(t.gx, t.gy, () => this.tour(t, w.x, w.y));
    }
    for (const e of game.ennemis) {
      const w = gridToWorld(e.gx, e.gy);
      ajouter(e.gx, e.gy, () => this.ennemi(e, w.x, w.y));
    }
    for (const p of game.projectiles) {
      if (dedans(p.x, p.y)) calques.push({ profondeur: p.y + 0.5, dessiner: () => this.projectile(p) });
    }

    // Le plateau d'en face, reconstruit depuis ses instantanés.
    const adverse = game.mode === 'duel' ? game.vueAdverse.etat() : null;
    if (adverse) this.plateauAdverse(adverse, ajouter);

    calques.sort((a, b) => a.profondeur - b.profondeur);
    for (const c of calques) c.dessiner();

    this.barresDeVie(adverse);
    this.particules();

    ctx.restore();
  }

  /** Ajoute au tri en profondeur tout ce que l'adversaire nous a montré. */
  private plateauAdverse(
    s: Instantane,
    ajouter: (gx: number, gy: number, d: () => void) => void,
  ): void {
    const { ctx, game } = this;
    for (const b of s.bats) {
      const w = gridToWorld(b.x, b.y);
      ajouter(b.x, b.y, () => dessinerBatiment(ctx, w.x, w.y, b.t, game.t));
    }
    for (const b of s.bebes) {
      const w = gridToWorld(b.x, b.y);
      ajouter(b.x, b.y, () => {
        ombre(ctx, w.x, w.y, 7, 0.24);
        if (b.e > 0) dessinerOeuf(ctx, w.x, w.y, 1 - b.e / DEFS_BEBES[b.t].eclosion, game.t);
        else dessinerBebe(ctx, w.x, w.y, b.t, game.t + b.x);
      });
    }
    for (const t of s.tours) {
      const w = gridToWorld(t.x, t.y);
      ajouter(t.x, t.y, () => {
        ombre(ctx, w.x, w.y, 13, 0.3);
        this.spriteTour(t.t, w.x, w.y, game.t + t.x, t.n, false, 0);
      });
    }
    for (const e of s.ennemis) {
      const w = gridToWorld(e.x, e.y);
      ajouter(e.x, e.y, () => this.ennemiAdverse(e, w.x, w.y));
    }
  }

  /* ---------------------------------------------------------------- */

  private fond(): void {
    const { ctx } = this;
    const g = ctx.createLinearGradient(0, 0, 0, this.game.camera.viewH);
    g.addColorStop(0, '#1a2740');
    g.addColorStop(1, '#0c1220');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.game.camera.viewW, this.game.camera.viewH);
  }

  private sol(dedans: (wx: number, wy: number) => boolean): void {
    const { ctx, game } = this;
    const map = game.map;

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    const coins = [
      gridToWorld(-0.5, -0.5),
      gridToWorld(map.largeur - 0.5, -0.5),
      gridToWorld(map.largeur - 0.5, map.hauteur - 0.5),
      gridToWorld(-0.5, map.hauteur - 0.5),
    ];
    ctx.moveTo(coins[0].x, coins[0].y + 10);
    for (const c of coins.slice(1)) ctx.lineTo(c.x, c.y + 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    for (let gy = 0; gy < map.hauteur; gy++) {
      for (let gx = 0; gx < map.largeur; gx++) {
        const c = gridToWorld(gx, gy);
        if (!dedans(c.x, c.y)) continue;

        const type = map.at(gx, gy);
        const n = this.teintes[gy * map.largeur + gx];
        const zone = map.zoneDe(gx);
        const aMoi = map.proprietaire(gx, gy) === game.moi;
        pathTile(ctx, gx, gy);

        if (type === 'herbe' || type === 'barriere') {
          const clair = (gx + gy) % 2 === 0;
          const l = 34 + n * 7 + (clair ? 5 : 0);
          // La ferme est plus chaude ; le camp d'en face est légèrement désaturé
          // pour qu'on sache toujours d'un coup d'œil chez qui l'on regarde.
          const sat = aMoi ? 1 : 0.55;
          ctx.fillStyle =
            zone === 'ferme'
              ? `hsl(${88 + n * 14}, ${(36 + n * 8) * sat}%, ${l + 7}%)`
              : `hsl(${104 + n * 14}, ${(30 + n * 8) * sat}%, ${l}%)`;
        } else if (type === 'champ') {
          ctx.fillStyle = `hsl(${28 + n * 6}, ${34 * (aMoi ? 1 : 0.55)}%, ${30 + n * 5}%)`;
        } else {
          ctx.fillStyle = `hsl(${34 + n * 8}, ${26 * (aMoi ? 1 : 0.55)}%, ${40 + n * 5}%)`;
        }
        ctx.fill();

        if (estChemin(type)) {
          ctx.fillStyle = `hsla(38, 22%, ${62 + n * 10}%, 0.5)`;
          for (let i = 0; i < 3; i++) {
            const a = n * 20 + i * 2.3;
            ctx.beginPath();
            ctx.ellipse(c.x + Math.cos(a) * 14, c.y + Math.sin(a) * 7, 3.4, 1.9, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (type === 'champ') {
          ctx.strokeStyle = 'rgba(0,0,0,0.18)';
          ctx.lineWidth = 1;
          for (const k of [-8, 0, 8]) {
            ctx.beginPath();
            ctx.moveTo(c.x - 24 + k, c.y + k * 0.5);
            ctx.lineTo(c.x + 8 + k, c.y + k * 0.5);
            ctx.stroke();
          }
        }
      }
    }

    // Liseré des tuiles où *je* peux poser quelque chose.
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let gy = 0; gy < map.hauteur; gy++) {
      for (let gx = 0; gx < map.largeur; gx++) {
        if (map.at(gx, gy) !== 'herbe') continue;
        if (map.proprietaire(gx, gy) !== game.moi) continue;
        const c = gridToWorld(gx, gy);
        if (!dedans(c.x, c.y)) continue;
        pathTile(ctx, gx, gy);
        ctx.stroke();
      }
    }
  }

  /** Entrée, village et flèches de direction, pour chaque chemin de la carte. */
  private marqueurs(): void {
    const { ctx, game } = this;
    for (const j of game.map.joueurs) {
      const sommets = game.map.chemins[j];
      if (!sommets.length) continue;
      const mien = j === game.moi;

      ctx.save();
      ctx.globalAlpha = mien ? 0.28 : 0.16;
      ctx.fillStyle = '#fff';
      for (let d = 1; d < game.map.longueurs[j]; d += 2.2) {
        const a = game.map.pointSurChemin(j, d);
        const b = game.map.pointSurChemin(j, Math.min(d + 0.4, game.map.longueurs[j]));
        const wa = gridToWorld(a.x, a.y);
        const wb = gridToWorld(b.x, b.y);
        const ang = Math.atan2(wb.y - wa.y, wb.x - wa.x);
        ctx.save();
        ctx.translate(wa.x, wa.y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(-4, -3.4);
        ctx.lineTo(-4, 3.4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      const entree = gridToWorld(sommets[0].x, sommets[0].y);
      const sortie = gridToWorld(
        sommets[sommets.length - 1].x,
        sommets[sommets.length - 1].y,
      );

      ctx.save();
      ctx.globalAlpha = mien ? 0.75 : 0.4;
      ctx.fillStyle = '#2b1b3d';
      ctx.beginPath();
      ctx.ellipse(entree.x, entree.y, 20, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#a06bff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      for (let i = 0; i < 3; i++) {
        const a = game.t * 1.6 + (i * Math.PI * 2) / 3;
        etoile(ctx, entree.x + Math.cos(a) * 16, entree.y - 12 + Math.sin(a) * 5, 3, '#a06bff', a);
      }

      ctx.save();
      ctx.globalAlpha = (mien ? 0.5 : 0.25) + Math.sin(game.t * 3) * 0.1;
      ctx.fillStyle = mien ? '#ff7b8a' : '#7ba8ff';
      ctx.beginPath();
      ctx.ellipse(sortie.x, sortie.y, 22, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ombre(ctx, sortie.x, sortie.y, 12, 0.2);
      ctx.fillStyle = '#e8e2d0';
      ctx.fillRect(sortie.x - 11, sortie.y - 22, 22, 22);
      ctx.fillStyle = mien ? '#c0453f' : '#3f5fc0';
      ctx.beginPath();
      ctx.moveTo(sortie.x - 14, sortie.y - 22);
      ctx.lineTo(sortie.x, sortie.y - 34);
      ctx.lineTo(sortie.x + 14, sortie.y - 22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7ab6ff';
      ctx.fillRect(sortie.x - 4, sortie.y - 17, 8, 8);
    }
  }

  /* ---------------------------------------------------------------- */

  private aidesDePlacement(): void {
    const { ctx, game } = this;

    const sel = game.selection;
    if (sel?.cat === 'tour') {
      this.cercle(
        sel.tour.gx,
        sel.tour.gy,
        niveauActuel(sel.tour).portee,
        'rgba(255,209,102,0.85)',
        'rgba(255,209,102,0.10)',
      );
    } else if (sel?.cat === 'batiment') {
      this.cercle(
        sel.batiment.gx,
        sel.batiment.gy,
        Math.min(sel.batiment.def.rayon, RAYON_MAX_AFFICHE),
        'rgba(126,224,138,0.8)',
        'rgba(126,224,138,0.10)',
      );
      this.marquerSpots(
        game.map.spots.filter((s) => couvre(sel.batiment, s)),
        '#7ee08a',
      );
    } else if (sel?.cat === 'bebe') {
      const spot = game.spotDuBebe(sel.bebe);
      if (spot) this.marquerSpots([spot], '#ffd166');
    }

    const o = game.outil;
    const h = game.survol;

    if (o?.cat === 'bebe') {
      const libres = game.map
        .spotsDe(game.moi)
        .filter((s) => s.occupePar === null);
      const pulse = 0.5 + 0.5 * Math.sin(game.t * 4);
      ctx.save();
      ctx.globalAlpha = 0.35 + pulse * 0.4;
      this.marquerSpots(libres, '#7ee08a');
      ctx.restore();
    }

    if (!h) return;

    if (!o) {
      pathTile(ctx, h.gx, h.gy);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      return;
    }

    const ok = game.posableSur(o, h.gx, h.gy);
    const trait = ok ? 'rgba(126,224,138,0.8)' : 'rgba(255,107,107,0.8)';
    const fond = ok ? 'rgba(126,224,138,0.12)' : 'rgba(255,107,107,0.12)';

    if (o.cat === 'tour') {
      this.cercle(h.gx, h.gy, DEFS_TOURS[o.type].niveaux[0].portee, trait, fond);
    } else if (o.cat === 'batiment') {
      const def = DEFS_BATIMENTS[o.type];
      this.cercle(h.gx, h.gy, Math.min(def.rayon, RAYON_MAX_AFFICHE), trait, fond);
      this.marquerSpots(
        game.map
          .spotsDe(game.moi)
          .filter(
            (s) =>
              def.cibles.includes(s.ressource) &&
              Math.hypot(s.gx - h.gx, s.gy - h.gy) <= def.rayon,
          ),
        '#7ee08a',
      );
    }

    pathTile(ctx, h.gx, h.gy);
    ctx.fillStyle = ok ? 'rgba(126,224,138,0.35)' : 'rgba(255,107,107,0.35)';
    ctx.fill();

    if (ok) this.fantome(o, h.gx, h.gy);
  }

  private fantome(o: Outil, gx: number, gy: number): void {
    const { ctx, game } = this;
    const w = gridToWorld(gx, gy);
    ctx.save();
    ctx.globalAlpha = 0.6;
    switch (o.cat) {
      case 'tour':
        this.spriteTour(o.type, w.x, w.y, game.t, 1, false, 0);
        break;
      case 'batiment':
        dessinerBatiment(ctx, w.x, w.y, o.type, game.t);
        break;
      case 'bebe':
        dessinerBebe(ctx, w.x, w.y, o.type, game.t);
        break;
    }
    ctx.restore();
  }

  private marquerSpots(spots: SpotRessource[], couleur: string): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = couleur;
    ctx.lineWidth = 2;
    for (const s of spots) {
      const w = gridToWorld(s.gx, s.gy);
      ctx.beginPath();
      ctx.ellipse(w.x, w.y, TILE_W / 2 - 4, TILE_H / 2 - 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private cercle(
    gx: number,
    gy: number,
    rayonTuiles: number,
    trait: string,
    remplissage: string,
  ): void {
    const { ctx } = this;
    const c = gridToWorld(gx, gy);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, (rayonTuiles * TILE_W) / 2, (rayonTuiles * TILE_H) / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = remplissage;
    ctx.fill();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = trait;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ---------------------------------------------------------------- */

  private spriteTour(
    type: TypeTour,
    x: number,
    y: number,
    t: number,
    niveau: number,
    versGauche: boolean,
    recul: number,
  ): void {
    if (type === 'coq') dessinerCoq(this.ctx, x, y, 1, t, niveau, versGauche, recul);
    else dessinerAigle(this.ctx, x, y, 1, t, niveau, versGauche, recul);
  }

  private tour(t: Tour, x: number, y: number): void {
    const { ctx, game } = this;
    ombre(ctx, x, y, 13, 0.3);

    const sel = game.selection;
    if (sel?.cat === 'tour' && sel.tour.id === t.id) this.anneauSelection(x, y, 16);

    this.spriteTour(t.type, x, y, t.t, t.niveau, Math.cos(t.angle) < 0, t.recul);

    if (t.niveau > 1) {
      for (let i = 0; i < t.niveau - 1; i++) {
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(x - 6 + i * 6, y + 5, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private bebe(b: Bebe, x: number, y: number): void {
    const { ctx, game } = this;
    const sel = game.selection;
    if (sel?.cat === 'bebe' && sel.bebe.id === b.id) this.anneauSelection(x, y, 12);

    ombre(ctx, x, y, 7, 0.24);
    if (b.eclosion > 0) {
      const progression = 1 - b.eclosion / DEFS_BEBES[b.type].eclosion;
      dessinerOeuf(ctx, x, y, progression, b.t);
      const l = 20;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      roundRect(ctx, x - l / 2 - 1, y - 27, l + 2, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = '#ffe08a';
      roundRect(ctx, x - l / 2, y - 26, l * progression, 3, 1.5);
      ctx.fill();
      return;
    }
    dessinerBebe(ctx, x, y, b.type, b.t);
  }

  private batiment(b: Batiment, x: number, y: number): void {
    const sel = this.game.selection;
    if (sel?.cat === 'batiment' && sel.batiment.id === b.id) this.anneauSelection(x, y, 18);
    dessinerBatiment(this.ctx, x, y, b.type, b.t);
  }

  private anneauSelection(x: number, y: number, rx: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Fanion bleu : cette créature a été payée et envoyée par un joueur. */
  private fanion(x: number, y: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = '#6fa8ff';
    ctx.beginPath();
    ctx.moveTo(x - 1, y - 30);
    ctx.lineTo(x - 1, y - 42);
    ctx.lineTo(x + 8, y - 38);
    ctx.lineTo(x - 1, y - 34);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#dce8ff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 1.5, y - 28);
    ctx.lineTo(x - 1.5, y - 43);
    ctx.stroke();
    ctx.restore();
  }

  private silhouetteEnnemi(type: Ennemi['type'], x: number, y: number, t: number): void {
    const { ctx } = this;
    switch (type) {
      case 'goblinet':
        dessinerGoblinet(ctx, x, y, 1, t);
        break;
      case 'bunny':
        dessinerBunny(ctx, x, y, 1, t);
        break;
      case 'bat':
        dessinerBat(ctx, x, y, 1, t);
        break;
      case 'titan':
        dessinerTitan(ctx, x, y, 1, t);
        break;
    }
  }

  private ennemi(e: Ennemi, x: number, y: number): void {
    const { ctx } = this;
    ombre(ctx, x, y, e.def.taille * 0.75, e.def.volant ? 0.16 : 0.28);

    const ey = y - e.z;
    ctx.save();
    if (e.flash > 0) ctx.filter = 'brightness(2.6) saturate(0.4)';
    this.silhouetteEnnemi(e.type, x, ey, e.t);
    ctx.restore();
    if (e.envoye) this.fanion(x, ey);
  }

  private ennemiAdverse(e: InstEnnemi, x: number, y: number): void {
    const { ctx, game } = this;
    ombre(ctx, x, y, 9, e.t === 'bat' ? 0.16 : 0.26);
    const ey = y - e.z;
    this.silhouetteEnnemi(e.t, x, ey, game.t + e.i);
    if (e.env) this.fanion(x, ey);
  }

  private projectile(p: Projectile): void {
    const { ctx } = this;
    const y = p.y - p.z;

    ctx.save();
    for (let i = 0; i < p.trainee.length; i++) {
      const q = p.trainee[i];
      ctx.globalAlpha = ((i + 1) / p.trainee.length) * 0.4;
      ctx.fillStyle = p.couleur;
      ctx.beginPath();
      ctx.arc(q.x, q.y - q.z, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(p.x, y);
    ctx.rotate(p.angle);
    if (p.type === 'pic') {
      ctx.fillStyle = p.couleur;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-4, -2.4);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-4, 2.4);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.shadowColor = '#8cdcff';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = '#fff6c9';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.lineTo(-2, -3);
      ctx.lineTo(1, 2);
      ctx.lineTo(7, -1);
      ctx.stroke();
    }
    ctx.restore();
  }

  private barreDeVie(wx: number, wy: number, z: number, taille: number, ratio: number, boss: boolean): void {
    const { ctx } = this;
    const largeur = boss ? 54 : 20;
    const x = wx - largeur / 2;
    const y = wy - z - taille * 2.1 - (boss ? 24 : 4);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, x - 1, y - 1, largeur + 2, 5, 2.5);
    ctx.fill();
    ctx.fillStyle = ratio > 0.5 ? '#7ee08a' : ratio > 0.25 ? '#ffd166' : '#ff6b6b';
    roundRect(ctx, x, y, largeur * ratio, 3, 1.5);
    ctx.fill();
  }

  private barresDeVie(adverse: Instantane | null): void {
    const { game } = this;
    for (const e of game.ennemis) {
      if (e.pv >= e.pvMax) continue;
      const w = gridToWorld(e.gx, e.gy);
      this.barreDeVie(w.x, w.y, e.z, e.def.taille, Math.max(0, e.pv / e.pvMax), e.def.boss);
    }
    if (!adverse) return;
    for (const e of adverse.ennemis) {
      if (e.pv >= 1) continue;
      const w = gridToWorld(e.x, e.y);
      this.barreDeVie(w.x, w.y, e.z, e.t === 'titan' ? 22 : 11, e.pv, e.t === 'titan');
    }
  }

  private particules(): void {
    const { ctx, game } = this;

    for (const p of game.effets.particules) {
      const a = Math.min(1, p.vie / (p.vieMax * 0.5));
      ctx.save();
      ctx.globalAlpha = a;
      const y = p.y - p.z;
      if (p.forme === 'etoile') {
        etoile(ctx, p.x, y, p.taille, p.couleur, p.rot);
      } else if (p.forme === 'confetti') {
        ctx.translate(p.x, y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.couleur;
        ctx.fillRect(-p.taille / 2, -p.taille / 4, p.taille, p.taille / 2);
      } else {
        ctx.fillStyle = p.couleur;
        ctx.beginPath();
        ctx.arc(p.x, y, p.taille, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.font = 'bold 13px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    for (const t of game.effets.textes) {
      ctx.globalAlpha = Math.min(1, t.vie / (t.vieMax * 0.6));
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(t.texte, t.x, t.y - t.z);
      ctx.fillStyle = t.couleur;
      ctx.fillText(t.texte, t.x, t.y - t.z);
    }
    ctx.restore();
  }
}

/** Réexport pour lever l'ambiguïté sur le type joueur utilisé dans les signatures. */
export type { Joueur };
