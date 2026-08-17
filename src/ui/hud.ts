import type { Game, Mode, Outil, Vue } from '../game/game';

/** Les deux onglets de boutique : ce sont les zones que l'on possède. */
type ZoneBoutique = 'defense' | 'ferme';
import { DEFS_UNITES, ORDRE_UNITES, type TypeUnite } from '../game/army';
import { Reseau, type EtatReseau } from '../net/client';
import type { JoueurSalon } from '../net/protocole';
import {
  CARTES,
  FERMES,
  ORDRE_CARTES,
  ORDRE_FERMES,
  type NiveauCarte,
  type NiveauFerme,
} from '../game/difficulty';
import {
  DEFS_BATIMENTS,
  DEFS_BEBES,
  multiplicateur,
  type TypeBatiment,
  type TypeBebe,
} from '../game/farm';
import {
  formatCout,
  INFOS,
  peutPayer,
  RESSOURCES,
  type TypeRessource,
} from '../game/resources';
import {
  DEFS_TOURS,
  LIBELLE_CIBLE,
  niveauActuel,
  prochainNiveau,
  valeurRevente,
  type TypeTour,
} from '../game/towers';
import { dessinerAigle, dessinerCoq } from '../render/sprites';
import { dessinerBatiment, dessinerBebe } from '../render/farmSprites';

/**
 * Une carte de la boutique. Le prix n'est pas stocké ici : il monte à chaque
 * exemplaire posé, donc il est relu depuis le jeu à chaque frame.
 */
interface Entree {
  outil: Outil;
  nom: string;
  sous: string;
  touche?: string;
  /** Dessine l'aperçu, contexte déjà centré sur le point d'appui au sol. */
  apercu: (ctx: CanvasRenderingContext2D) => void;
}

/** Ce que le HUD demande au reste de l'application. */
export interface RappelsHud {
  /** Le joueur lance une partie solo. */
  onSolo: () => void;
  onConnecter: (url: string, salon: string, pseudo: string) => void;
  /** Le joueur (dé)clare qu'il est prêt dans le salon. */
  onPret: (pret: boolean) => void;
  /** L'hôte a changé un réglage : à pousser à l'adversaire. */
  onReglages: () => void;
  /** Zoom demandé par les boutons tactiles (facteur > 1 = rapprocher). */
  onZoom: (facteur: number) => void;
}

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Élément #${id} introuvable`);
  return e as T;
}

/** « 2:07 » */
function formatTemps(secondes: number): string {
  const s = Math.max(0, Math.floor(secondes));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const CARTES_BOUTIQUE: Record<ZoneBoutique, Entree[]> = {
  defense: (['coq', 'aigle'] as TypeTour[]).map((type, i) => {
    const def = DEFS_TOURS[type];
    return {
      outil: { cat: 'tour', type },
      nom: `${def.drapeau} ${def.nom}`,
      sous: def.role,
      touche: String(i + 1),
      apercu: (ctx) =>
        type === 'coq'
          ? dessinerCoq(ctx, 0, 0, 1, 0.7, 1, false, 0)
          : dessinerAigle(ctx, 0, 0, 1, 0.7, 1, false, 0),
    };
  }),
  ferme: [
    ...(['poussin', 'aiglon'] as TypeBebe[]).map((type, i) => {
      const def = DEFS_BEBES[type];
      return {
        outil: { cat: 'bebe', type } as Outil,
        nom: `${def.drapeau} ${def.nom}`,
        sous: def.desc,
        touche: String(i + 1),
        apercu: (ctx: CanvasRenderingContext2D) => dessinerBebe(ctx, 0, 0, type, 0.7),
      };
    }),
    ...(['moulin', 'campBuches', 'campMine', 'entrepot'] as TypeBatiment[]).map((type, i) => {
      const def = DEFS_BATIMENTS[type];
      return {
        outil: { cat: 'batiment', type } as Outil,
        nom: `${def.icone} ${def.nom}`,
        sous: def.desc,
        touche: String(i + 3),
        apercu: (ctx: CanvasRenderingContext2D) => {
          ctx.scale(0.8, 0.8);
          dessinerBatiment(ctx, 0, 0, type, 0.7);
        },
      };
    }),
  ],
};

/**
 * Interface en DOM par-dessus le canvas. Le HUD lit l'état du jeu à chaque frame
 * et n'écrit dans le DOM que ce qui a changé.
 */
export class Hud {
  private readonly progressionFill = el<HTMLElement>('progression-fill');
  private readonly progression = el<HTMLElement>('progression');
  private readonly barreHaut = el<HTMLElement>('barre-haut');
  private readonly ressources = el<HTMLElement>('ressources');
  private readonly valAmes = el<HTMLSpanElement>('val-ames');
  private readonly valVies = el<HTMLSpanElement>('val-vies');
  private readonly valVague = el<HTMLSpanElement>('val-vague');
  private readonly valTemps = el<HTMLSpanElement>('val-temps');
  private readonly valCompteur = el<HTMLSpanElement>('val-compteur');
  private readonly jaugeCompteur = el<HTMLElement>('jauge-compteur');
  private readonly btnZone = el<HTMLButtonElement>('btn-zone');
  private readonly btnVitesse = el<HTMLButtonElement>('btn-vitesse');
  private readonly onglets = el<HTMLElement>('onglets');
  private readonly cartes = el<HTMLElement>('cartes');
  private readonly boutique = el<HTMLElement>('boutique');
  private readonly aide = el<HTMLElement>('aide');
  private readonly panneau = el<HTMLElement>('panneau');
  private readonly panNom = el<HTMLSpanElement>('pan-nom');
  private readonly panSous = el<HTMLSpanElement>('pan-sous');
  private readonly panNiveau = el<HTMLElement>('pan-niveau');
  private readonly panStats = el<HTMLElement>('pan-stats');
  private readonly panDesc = el<HTMLElement>('pan-desc');
  private readonly btnUpgrade = el<HTMLButtonElement>('btn-upgrade');
  private readonly btnCible = el<HTMLButtonElement>('btn-cible');
  private readonly btnVendre = el<HTMLButtonElement>('btn-vendre');
  private readonly bandeau = el<HTMLElement>('bandeau');

  private readonly panneauTactile = el<HTMLElement>('tactile');
  private readonly btnZoomPlus = el<HTMLButtonElement>('btn-zoom-plus');
  private readonly btnZoomMoins = el<HTMLButtonElement>('btn-zoom-moins');
  private readonly btnAnnuler = el<HTMLButtonElement>('btn-annuler');

  private readonly menu = el<HTMLElement>('menu');
  private readonly choixFerme = el<HTMLElement>('choix-ferme');
  private readonly choixCarte = el<HTMLElement>('choix-carte');
  private readonly valGraine = el<HTMLElement>('val-graine');
  private readonly valLongueur = el<HTMLElement>('val-longueur');
  private readonly btnGraine = el<HTMLButtonElement>('btn-graine');
  private readonly btnJouer = el<HTMLButtonElement>('btn-jouer');

  private readonly jaugeAdversaire = el<HTMLElement>('jauge-adversaire');
  private readonly valAdversaire = el<HTMLElement>('val-adversaire');
  private readonly choixMode = el<HTMLElement>('choix-mode');
  private readonly sectionReseau = el<HTMLElement>('section-reseau');
  private readonly inPseudo = el<HTMLInputElement>('in-pseudo');
  private readonly inSalon = el<HTMLInputElement>('in-salon');
  private readonly inServeur = el<HTMLInputElement>('in-serveur');
  private readonly btnConnecter = el<HTMLButtonElement>('btn-connecter');
  private readonly etatReseau = el<HTMLElement>('etat-reseau');
  private readonly listeJoueurs = el<HTMLElement>('liste-joueurs');
  private readonly panneauArmee = el<HTMLElement>('armee');
  private readonly lignesUnites = el<HTMLElement>('lignes-unites');
  private readonly totalArmee = el<HTMLElement>('total-armee');

  private readonly fin = el<HTMLElement>('fin');
  private readonly finTitre = el<HTMLElement>('fin-titre');
  private readonly finTexte = el<HTMLElement>('fin-texte');
  private readonly finStats = el<HTMLElement>('fin-stats');
  private readonly btnRejouer = el<HTMLButtonElement>('btn-rejouer');
  private readonly btnMenu = el<HTMLButtonElement>('btn-menu');

  private readonly jauges = new Map<TypeRessource, { val: HTMLElement; taux: HTMLElement }>();
  private readonly boutonsFerme = new Map<NiveauFerme, HTMLButtonElement>();
  private readonly boutonsCarte = new Map<NiveauCarte, HTMLButtonElement>();

  private cartesAffichees: {
    entree: Entree;
    noeud: HTMLButtonElement;
    prix: HTMLElement;
  }[] = [];
  private readonly lignesArmee = new Map<
    TypeUnite,
    { noeud: HTMLElement; prix: HTMLElement; compte: HTMLElement }
  >();

  private zoneAffichee: ZoneBoutique | null = null;
  private signaturePanneau = '';
  private dernierBandeau = '';

  /** Mode choisi dans le menu, avant que la partie ne démarre. */
  mode: Mode = 'solo';
  /** Vrai sur un appareil tactile : la palette de gestes de secours s'affiche. */
  tactile = false;
  /** Explication de fin fournie par le serveur en duel. */
  raisonFin = '';
  /** Vrai quand le joueur s'est annoncé prêt dans le salon. */
  private pret = false;
  private joueursSalon: JoueurSalon[] = [];
  private maPlace = 0;

  constructor(
    private readonly game: Game,
    private readonly rappels: RappelsHud,
  ) {
    this.construireJauges();
    this.construireMenu();
    this.construireArmee();
    this.brancherBoutons();
  }

  private construireJauges(): void {
    for (const r of RESSOURCES) {
      const info = INFOS[r];
      const d = document.createElement('div');
      d.className = 'jauge';
      d.title = `${info.nom} — ${info.usage}`;
      d.innerHTML = `<span class="icone">${info.icone}</span><span class="val"></span><span class="taux"></span>`;
      const val = d.querySelector('.val') as HTMLElement;
      const taux = d.querySelector('.taux') as HTMLElement;
      val.style.color = info.couleur;
      this.ressources.appendChild(d);
      this.jauges.set(r, { val, taux });
    }
  }

  /** Les deux axes de difficulté du menu. Chaque clic régénère l'aperçu de la carte. */
  private construireMenu(): void {
    const bouton = (cran: string, nom: string, resume: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.innerHTML = `<span class="cran">${cran}</span><span class="titre-choix">${nom}</span><span class="detail">${resume}</span>`;
      return b;
    };

    for (const n of ORDRE_FERMES) {
      const r = FERMES[n];
      const b = bouton(r.cran, r.nom, r.resume);
      b.addEventListener('click', () => {
        this.game.previsualiser({ ferme: n });
        this.rappels.onReglages();
        b.blur(); // sinon Entrée re-déclencherait ce bouton au lieu de lancer la partie
      });
      this.choixFerme.appendChild(b);
      this.boutonsFerme.set(n, b);
    }
    for (const n of ORDRE_CARTES) {
      const r = CARTES[n];
      const b = bouton(r.cran, r.nom, r.resume);
      b.addEventListener('click', () => {
        this.game.previsualiser({ carte: n });
        this.rappels.onReglages();
        b.blur();
      });
      this.choixCarte.appendChild(b);
      this.boutonsCarte.set(n, b);
    }

    for (const b of this.choixMode.querySelectorAll<HTMLButtonElement>('button')) {
      b.addEventListener('click', () => {
        this.mode = b.dataset.mode as Mode;
        this.pret = false;
        b.blur();
      });
    }

    this.inServeur.value = Reseau.urlParDefaut();
  }

  /** Les trois unités que l'on peut mettre en file pour l'adversaire. */
  private construireArmee(): void {
    for (const type of ORDRE_UNITES) {
      const def = DEFS_UNITES[type];
      const ligne = document.createElement('button');
      ligne.className = 'ligne-unite';
      ligne.title = def.role;
      ligne.innerHTML = `
        <span class="emoji">${def.icone}</span>
        <span><span class="nom-unite">${def.nom}</span><span class="prix-unite"></span></span>
        <span class="compte">0</span>`;
      ligne.addEventListener('click', () => this.game.enroler(type));
      ligne.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.game.desenroler(type);
      });
      this.lignesUnites.appendChild(ligne);
      this.lignesArmee.set(type, {
        noeud: ligne,
        prix: ligne.querySelector('.prix-unite') as HTMLElement,
        compte: ligne.querySelector('.compte') as HTMLElement,
      });
    }
  }

  private brancherBoutons(): void {
    const g = this.game;
    this.btnVitesse.addEventListener('click', () => g.basculerVitesse());
    this.btnZone.addEventListener('click', () => g.basculerZone());

    this.btnJouer.addEventListener('click', () => {
      if (this.mode === 'solo') {
        this.rappels.onSolo();
      } else {
        // En duel, « jouer » veut dire « je suis prêt » : c'est le serveur qui lance
        // la partie une fois les deux joueurs prêts.
        this.pret = !this.pret;
        this.rappels.onPret(this.pret);
      }
    });
    this.btnConnecter.addEventListener('click', () => {
      this.pret = false;
      this.rappels.onConnecter(
        this.inServeur.value.trim(),
        this.inSalon.value.trim() || 'PUBLIC',
        this.inPseudo.value.trim() || 'Joueur',
      );
    });
    this.btnGraine.addEventListener('click', () =>
      g.previsualiser({ graine: 1 + Math.floor(Math.random() * 99999) }),
    );
    this.btnRejouer.addEventListener('click', () => g.rejouer());
    this.btnMenu.addEventListener('click', () => g.retourMenu());

    // Les onglets pilotent la caméra : changer d'onglet, c'est changer de zone.
    for (const b of this.onglets.querySelectorAll<HTMLButtonElement>('.onglet')) {
      b.addEventListener('click', () => {
        g.outil = null;
        g.allerA((b.dataset.onglet === 'ferme' ? 'ma-ferme' : 'ma-defense') as Vue);
      });
    }

    // Palette tactile : ce que le doigt ne peut pas exprimer (molette, clic droit).
    this.btnZoomPlus.addEventListener('click', () => this.rappels.onZoom(1.25));
    this.btnZoomMoins.addEventListener('click', () => this.rappels.onZoom(0.8));
    this.btnAnnuler.addEventListener('click', () => {
      if (g.outil) g.outil = null;
      else g.selection = null;
    });

    this.btnUpgrade.addEventListener('click', () => {
      if (g.selection?.cat === 'tour') g.ameliorer(g.selection.tour);
    });
    this.btnCible.addEventListener('click', () => {
      if (g.selection?.cat === 'tour') g.cyclerCible(g.selection.tour);
    });
    this.btnVendre.addEventListener('click', () => {
      const s = g.selection;
      if (!s) return;
      if (s.cat === 'tour') g.vendreTour(s.tour);
      else if (s.cat === 'batiment') g.vendreBatiment(s.batiment);
      else g.renvoyerBebe(s.bebe);
    });
  }

  /** Active la n-ième carte de la boutique courante (raccourcis chiffrés). */
  activerCarte(index: number): void {
    const carte = this.cartesAffichees[index];
    if (carte) carte.noeud.click();
  }

  /** Reconstruit la rangée de cartes quand on change de zone. */
  private construireCartes(zone: ZoneBoutique): void {
    this.cartes.innerHTML = '';
    this.cartesAffichees = [];

    for (const entree of CARTES_BOUTIQUE[zone]) {
      const noeud = document.createElement('button');
      noeud.className = 'carte';
      noeud.innerHTML = `
        <canvas class="apercu" width="256" height="116"></canvas>
        ${entree.touche ? `<span class="touche">${entree.touche}</span>` : ''}
        <span class="nom">${entree.nom}</span>
        <span class="role">${entree.sous}</span>
        <span class="prix"></span>`;
      noeud.addEventListener('click', () => {
        const o = this.game.outil;
        const memeOutil =
          o && o.cat === entree.outil.cat && o.type === (entree.outil.type as string);
        this.game.outil = memeOutil ? null : entree.outil;
        this.game.selection = null;
      });
      this.cartes.appendChild(noeud);
      this.dessinerApercu(noeud.querySelector('canvas') as HTMLCanvasElement, entree);
      this.cartesAffichees.push({
        entree,
        noeud,
        prix: noeud.querySelector('.prix') as HTMLElement,
      });
    }
  }

  /** Rend la même illustration que dans le jeu, en miniature dans la carte. */
  private dessinerApercu(canvas: HTMLCanvasElement, entree: Entree): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(2, 0, 0, 2, 0, 0); // canvas en 2× pour rester net
    ctx.save();
    ctx.translate(canvas.width / 4, canvas.height / 2 - 2);
    entree.apercu(ctx);
    ctx.restore();
  }

  maj(): void {
    const g = this.game;
    const auMenu = g.phase === 'menu';

    const fini = g.phase === 'victoire' || g.phase === 'defaite';

    this.menu.hidden = !auMenu;
    this.barreHaut.hidden = auMenu;
    this.boutique.hidden = auMenu;
    this.aide.hidden = auMenu;
    this.progression.hidden = auMenu;
    this.panneauTactile.hidden = !this.tactile || auMenu || fini;
    // Le bouton d'annulation s'allume quand il y a effectivement quelque chose à annuler.
    this.btnAnnuler.classList.toggle('actif', g.outil !== null || g.selection !== null);

    if (auMenu) {
      this.majMenu();
      this.panneau.hidden = true;
      this.panneauArmee.hidden = true;
      this.bandeau.hidden = true;
      this.fin.hidden = true;
      return;
    }

    const duel = g.mode === 'duel';
    this.jaugeAdversaire.hidden = !duel;
    this.btnVitesse.hidden = duel; // vitesse verrouillée quand deux horloges tournent
    if (duel) {
      // On voit désormais toute son économie : c'est le sel du face à face.
      const r = g.vueAdverse.resume();
      this.valAdversaire.textContent = r
        ? `${r.vies} ❤ · V${r.vague} · 🪙${Math.floor(r.banque.or)} 🌾${Math.floor(r.banque.nourriture)}`
        : 'en attente…';
    }
    this.majArmee(duel);

    const prod = g.productionParSeconde();
    for (const r of RESSOURCES) {
      const j = this.jauges.get(r);
      if (!j) continue;
      j.val.textContent = String(Math.floor(g.banque[r]));
      // Le débit de nourriture est net d'entretien : il peut passer au rouge.
      const taux = prod[r];
      j.taux.textContent = taux === 0 ? '' : `${taux > 0 ? '+' : ''}${taux.toFixed(1)}/s`;
      j.taux.style.color = taux < 0 ? '#ff8a9c' : '#7ee08a';
    }

    this.valAmes.textContent = String(g.ames);
    this.valVies.textContent = String(g.vies);
    this.valVague.textContent = `${g.vague} / ${g.vagueTotale}`;
    this.valTemps.textContent = formatTemps(g.chrono);

    if (g.phase === 'preparation') {
      this.valCompteur.textContent = `${Math.ceil(g.compteur)} s`;
      this.jaugeCompteur.title = `Vague ${g.vague + 1} dans ${Math.ceil(g.compteur)} secondes`;
    } else {
      this.valCompteur.textContent = 'Assaut';
      this.jaugeCompteur.title = 'Vague en cours';
    }

    this.progressionFill.style.width = `${g.progression() * 100}%`;
    this.progressionFill.classList.toggle('assaut', g.phase === 'vague');

    this.btnVitesse.textContent = `${g.vitesse === 1 ? '▶' : g.vitesse === 2 ? '▶▶' : '▶▶▶'} ${g.vitesse}×`;
    this.btnZone.textContent = g.zoneActive === 'defense' ? '🌾 Ferme' : '⚔ Défense';

    // La boutique suit la zone regardée par la caméra.
    if (this.zoneAffichee !== g.zoneActive) {
      this.zoneAffichee = g.zoneActive;
      this.construireCartes(g.zoneActive);
      for (const b of this.onglets.querySelectorAll<HTMLButtonElement>('.onglet')) {
        b.classList.toggle('actif', b.dataset.onglet === g.zoneActive);
      }
    }

    for (const { entree, noeud, prix } of this.cartesAffichees) {
      const cout = g.coutOutil(entree.outil);
      prix.textContent = formatCout(cout);
      const o = g.outil;
      const actif = !!o && o.cat === entree.outil.cat && o.type === (entree.outil.type as string);
      noeud.classList.toggle('actif', actif);
      noeud.classList.toggle('inabordable', !peutPayer(g.banque, cout));
    }

    this.majPanneau();
    this.majBandeau();
    this.majFin();
  }

  /** Panneau d'armée : uniquement en duel, et seulement pendant le répit. */
  private majArmee(duel: boolean): void {
    const g = this.game;
    // Pendant l'assaut, l'armée est déjà partie : le panneau reste visible mais figé.
    this.panneauArmee.hidden = !duel;
    if (!duel) return;

    const effectif = g.effectifArmee();
    let total = 0;
    for (const type of ORDRE_UNITES) {
      const l = this.lignesArmee.get(type);
      if (!l) continue;
      const cout = g.coutUnite(type);
      l.prix.textContent = formatCout(cout);
      l.compte.textContent = String(effectif[type]);
      l.noeud.classList.toggle('inabordable', !peutPayer(g.banque, cout));
      total += effectif[type];
    }
    this.totalArmee.textContent =
      total === 0
        ? 'Aucune unité en attente'
        : `${total} unité${total > 1 ? 's' : ''} — départ au lancement de la vague`;
  }

  private majMenu(): void {
    const g = this.game;
    const duel = this.mode === 'duel';

    for (const b of this.choixMode.querySelectorAll<HTMLButtonElement>('button')) {
      b.classList.toggle('actif', b.dataset.mode === this.mode);
    }
    this.sectionReseau.hidden = !duel;

    // En duel, seul l'hôte (place 0) fixe les réglages : sinon les deux se marchent dessus.
    const peutRegler = !duel || this.maPlace === 0;
    for (const b of this.boutonsFerme.values()) b.disabled = !peutRegler;
    for (const b of this.boutonsCarte.values()) b.disabled = !peutRegler;
    this.btnGraine.disabled = !peutRegler;

    for (const [n, b] of this.boutonsFerme) b.classList.toggle('actif', g.options.ferme === n);
    for (const [n, b] of this.boutonsCarte) b.classList.toggle('actif', g.options.carte === n);
    this.valGraine.textContent = String(g.options.graine);
    this.valLongueur.textContent = `${Math.round(g.map.longueurs[g.moi])} cases de chemin · ${g.map.spotsDe(g.moi).length} spots`;

    if (duel) {
      const complet = this.joueursSalon.length === 2;
      this.btnJouer.disabled = !complet;
      this.btnJouer.textContent = !complet
        ? 'En attente d’un adversaire…'
        : this.pret
          ? '✓ Prêt — cliquez pour annuler'
          : 'Je suis prêt';
    } else {
      this.btnJouer.disabled = false;
      this.btnJouer.textContent = 'Lancer la partie';
    }

    // Le compteur de zone doit repartir de zéro quand on relance une partie.
    this.zoneAffichee = null;
  }

  /* ---------------------------------------------------------------- */
  /*  Appelé par la couche réseau                                      */
  /* ---------------------------------------------------------------- */

  majEtatReseau(etat: EtatReseau, message: string): void {
    this.etatReseau.textContent = message;
    this.etatReseau.classList.toggle('ok', etat === 'salon' || etat === 'partie');
    this.etatReseau.classList.toggle('ko', etat === 'erreur');
    if (etat === 'hors-ligne' || etat === 'erreur') {
      this.joueursSalon = [];
      this.pret = false;
      this.listeJoueurs.innerHTML = '';
    }
  }

  majSalon(joueurs: JoueurSalon[], maPlace: number): void {
    this.joueursSalon = joueurs;
    this.maPlace = maPlace;
    // Le serveur annule les « prêt » quand les réglages changent : on se resynchronise.
    this.pret = joueurs[maPlace]?.pret ?? false;
    this.listeJoueurs.innerHTML = joueurs
      .map(
        (j, i) =>
          `<li><span>${j.pseudo}${i === maPlace ? ' (vous)' : ''}${i === 0 ? ' · hôte' : ''}</span>` +
          `<span class="${j.pret ? 'pret' : 'attente'}">${j.pret ? '✓ prêt' : 'en attente'}</span></li>`,
      )
      .join('');
  }

  /** Remet le menu à zéro après une partie en ligne. */
  reinitialiserPret(): void {
    this.pret = false;
  }

  private majPanneau(): void {
    const g = this.game;
    const s = g.selection;
    if (!s) {
      this.panneau.hidden = true;
      this.signaturePanneau = '';
      return;
    }
    this.panneau.hidden = false;

    const ligne = (label: string, valeur: string, gain?: string): string =>
      `<span>${label}</span><span><b>${valeur}</b>${gain ? ` <span class="gain">${gain}</span>` : ''}</span>`;

    if (s.cat === 'tour') {
      const t = s.tour;
      const n = niveauActuel(t);
      const suivant = prochainNiveau(t);
      const signature = `t${t.id}|${t.niveau}|${t.mode}|${t.kills}|${g.ames >= (suivant?.coutAmes ?? Infinity)}`;
      if (signature === this.signaturePanneau) return;
      this.signaturePanneau = signature;

      this.panNom.textContent = t.def.nom;
      this.panSous.textContent = `${t.def.drapeau} ${t.def.pays}`;
      this.panNiveau.hidden = false;
      this.panNiveau.innerHTML = t.def.niveaux
        .map((_, i) => `<span class="pip${i < t.niveau ? ' on' : ''}"></span>`)
        .join('');

      this.panStats.innerHTML = [
        ligne('Dégâts', String(n.degats), suivant ? `→ ${suivant.degats}` : undefined),
        ligne('Cadence', `${n.cadence}/s`, suivant ? `→ ${suivant.cadence}/s` : undefined),
        ligne('Portée', `${n.portee} tuiles`, suivant ? `→ ${suivant.portee}` : undefined),
        ligne(
          'DPS',
          (n.degats * n.cadence).toFixed(1),
          suivant ? `→ ${(suivant.degats * suivant.cadence).toFixed(1)}` : undefined,
        ),
        ligne('Cibles', t.def.cibleAir ? 'Sol + Air' : 'Sol uniquement'),
        ligne('Éliminations', String(t.kills)),
      ].join('');

      this.panDesc.textContent = suivant ? `Prochain : ${suivant.desc}` : n.desc;

      this.btnUpgrade.hidden = false;
      if (suivant) {
        this.btnUpgrade.disabled = g.ames < suivant.coutAmes;
        this.btnUpgrade.textContent = `⬆ ${suivant.titre} — 👻 ${suivant.coutAmes}`;
      } else {
        this.btnUpgrade.disabled = true;
        this.btnUpgrade.textContent = '★ Niveau maximum';
      }
      this.btnCible.hidden = false;
      this.btnCible.textContent = `Cible : ${LIBELLE_CIBLE[t.mode]}`;
      this.btnVendre.textContent = `Vendre ${formatCout(valeurRevente(t))}`;
      return;
    }

    if (s.cat === 'bebe') {
      const b = s.bebe;
      const spot = g.spotDuBebe(b);
      const taux = spot ? multiplicateur(spot, b, g.batiments) : 0;
      const signature = `b${b.id}|${Math.floor(b.eclosion)}|${Math.floor(b.produit / 5)}|${taux.toFixed(2)}`;
      if (signature === this.signaturePanneau) return;
      this.signaturePanneau = signature;

      const info = spot ? INFOS[spot.ressource] : null;
      this.panNom.textContent = b.def.nom;
      this.panSous.textContent = `${b.def.drapeau} ${b.def.pays}`;
      this.panNiveau.hidden = true;

      this.panStats.innerHTML = [
        ligne('Récolte', info ? `${info.icone} ${info.nom}` : '—'),
        ligne('État', b.eclosion > 0 ? `Éclosion dans ${Math.ceil(b.eclosion)} s` : 'Au travail'),
        ligne('Production', b.eclosion > 0 ? '—' : `${taux.toFixed(2)}/s`),
        ligne(
          'Bonus national',
          spot && b.def.specialites.includes(spot.ressource)
            ? `+${Math.round(b.def.bonus * 100)} %`
            : 'aucun ici',
        ),
        ligne('Récolté au total', String(Math.floor(b.produit))),
      ].join('');

      this.panDesc.textContent = b.def.desc;
      this.btnUpgrade.hidden = true;
      this.btnCible.hidden = true;
      this.btnVendre.textContent = 'Renvoyer au nid';
      return;
    }

    const b = s.batiment;
    const couverts = g.map.spots.filter(
      (sp) =>
        b.def.cibles.includes(sp.ressource) &&
        Math.hypot(sp.gx - b.gx, sp.gy - b.gy) <= b.def.rayon,
    );
    const signature = `x${b.id}|${couverts.length}`;
    if (signature === this.signaturePanneau) return;
    this.signaturePanneau = signature;

    this.panNom.textContent = b.def.nom;
    this.panSous.textContent = b.def.icone;
    this.panNiveau.hidden = true;
    this.panStats.innerHTML = [
      ligne('Bonus', `+${Math.round(b.def.bonus * 100)} %`),
      ligne('Rayon', b.def.rayon > 20 ? 'Toute la ferme' : `${b.def.rayon} tuiles`),
      ligne('Ressources', b.def.cibles.map((r) => INFOS[r].icone).join(' ')),
      ligne('Spots couverts', String(couverts.length)),
    ].join('');
    this.panDesc.textContent = b.def.desc;
    this.btnUpgrade.hidden = true;
    this.btnCible.hidden = true;
    this.btnVendre.textContent = 'Démolir';
  }

  private majBandeau(): void {
    const b = this.game.bandeau;
    if (!b) {
      this.bandeau.hidden = true;
      this.dernierBandeau = '';
      return;
    }
    if (b.texte !== this.dernierBandeau) {
      this.dernierBandeau = b.texte;
      this.bandeau.textContent = b.texte;
      this.bandeau.classList.toggle('boss', b.boss);
      // Relance l'animation d'apparition.
      this.bandeau.style.animation = 'none';
      void this.bandeau.offsetWidth;
      this.bandeau.style.animation = '';
    }
    this.bandeau.hidden = false;
    this.bandeau.style.opacity = String(Math.min(1, b.vie * 2));
  }

  private majFin(): void {
    const g = this.game;
    const fini = g.phase === 'victoire' || g.phase === 'defaite';
    this.fin.hidden = !fini;
    if (!fini) return;

    const bloc = (valeur: string, label: string): string =>
      `<div class="bloc"><b>${valeur}</b><span>${label}</span></div>`;
    this.finStats.innerHTML =
      bloc(formatTemps(g.chrono), 'Temps') +
      bloc(`${g.vague}/${g.vagueTotale}`, 'Vagues') +
      bloc(String(g.vies), 'Vies') +
      bloc(String(g.tours.length), 'Tours') +
      bloc(String(g.bebes.length), 'Bébés');

    const duel = g.mode === 'duel';
    // En duel on ne relance pas seul : il faut repasser par le salon.
    this.btnRejouer.hidden = duel;

    if (g.phase === 'victoire') {
      this.finTitre.textContent = duel ? '🏆 Vous gagnez !' : '🎉 Victoire !';
      this.finTitre.style.color = '#7ee08a';
      this.finTexte.textContent =
        duel && this.raisonFin
          ? this.raisonFin
          : `${FERMES[g.options.ferme].nom} · carte ${CARTES[g.options.carte].nom} · graine ${g.options.graine}`;
    } else {
      this.finTitre.textContent = duel ? '☠ Vous perdez' : '💀 Défaite';
      this.finTitre.style.color = '#ff7b8a';
      this.finTexte.textContent =
        duel && this.raisonFin
          ? this.raisonFin
          : `Le village est tombé à la vague ${g.vague}.`;
    }
  }
}
