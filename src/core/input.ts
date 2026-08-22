/**
 * Entrées pointeur (souris, doigt, stylet) et clavier.
 *
 * Tout passe par les Pointer Events : un seul jeu de gestionnaires couvre la
 * souris du bureau et le tactile du mobile, sans dupliquer la logique dans des
 * handlers `touch*` parallèles.
 *
 * Les évènements sont mis en file et consommés une fois par frame par le jeu
 * (`prendreClics`, `prendreTouches`), ce qui évite d'éparpiller des callbacks
 * qui muteraient l'état du jeu au milieu d'une mise à jour.
 *
 * Grammaire tactile :
 *   - 1 doigt, appui bref sans bouger .......... clic gauche (poser / sélectionner) ;
 *   - 1 doigt glissé, sans outil en main ....... déplacement de la caméra ;
 *   - 1 doigt glissé, un outil en main ......... on vise, et on pose au relâché ;
 *   - appui long sans outil ..................... clic droit (annuler la sélection) ;
 *   - 2 doigts .................................. pincer pour zoomer, glisser pour déplacer.
 *
 * Un outil en main confisque le glisser à un doigt : c'est ce qui permet de
 * viser la tuile sous le doigt puis d'ajuster avant de lâcher, plutôt que de
 * poser à l'aveugle sous une pulpe qui masque la case.
 */

/** Au-delà de cette distance (px écran), un appui devient un glisser, pas un tap. */
const SEUIL_GLISSER = 12;
/** Durée (ms) au-delà de laquelle un appui immobile vaut « clic droit ». */
const DUREE_APPUI_LONG = 450;

export interface Clic {
  x: number;
  y: number;
  bouton: number; // 0 = gauche, 2 = droit
}

interface Contact {
  x: number;
  y: number;
  departX: number;
  departY: number;
  debut: number;
  type: string;
  bouton: number;
  /** Vrai dès que le contact a franchi le seuil de glisser. */
  aGlisse: boolean;
}

export class Input {
  /** Position du pointeur en pixels canvas, et s'il désigne actuellement le plateau. */
  pointeur = { x: 0, y: 0, sur: false };
  touches = new Set<string>();

  /**
   * Vrai quand le joueur a un bâtiment/une tour en main. Renseigné par la boucle
   * de jeu à chaque frame : le geste à un doigt vise au lieu de déplacer la caméra.
   */
  modePlacement = false;

  /** Vrai dès qu'un contact tactile a eu lieu : l'interface peut s'adapter. */
  tactile = false;

  private clics: Clic[] = [];
  private touchesPressees: string[] = [];
  private readonly contacts = new Map<number, Contact>();
  /** Écart entre les deux doigts au dernier évènement de pincement. */
  private ecartPince = 0;
  /** Milieu des deux doigts au dernier évènement de pincement. */
  private milieuPince = { x: 0, y: 0 };
  /** Vrai tant qu'un geste à deux doigts n'est pas complètement relâché. */
  private pince = false;

  /** Cumul du déplacement du pointeur pendant un glisser-caméra, en pixels écran. */
  panEnAttente = { x: 0, y: 0 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    /** Zoom demandé autour du point écran (sx, sy), `facteur` > 1 = rapprocher. */
    private readonly onZoom: (sx: number, sy: number, facteur: number) => void,
  ) {
    canvas.addEventListener('pointerdown', this.surAppui);
    window.addEventListener('pointermove', this.surMouvement);
    window.addEventListener('pointerup', this.surRelache);
    window.addEventListener('pointercancel', this.surAnnulation);
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.pointeur.sur = false;
    });
    canvas.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') this.pointeur.sur = true;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', this.surMolette, { passive: false });
    window.addEventListener('keydown', this.surTouche);
    window.addEventListener('keyup', (e) => this.touches.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => {
      this.touches.clear();
      this.contacts.clear();
      this.pince = false;
    });
  }

  private position(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private dansLeCanvas(p: { x: number; y: number }): boolean {
    return (
      p.x >= 0 && p.y >= 0 && p.x <= this.canvas.clientWidth && p.y <= this.canvas.clientHeight
    );
  }

  /** Les deux contacts d'un pincement, dans l'ordre d'arrivée. */
  private paire(): [Contact, Contact] | null {
    if (this.contacts.size !== 2) return null;
    const [a, b] = [...this.contacts.values()];
    return [a, b];
  }

  private surAppui = (e: PointerEvent): void => {
    const p = this.position(e);
    if (e.pointerType === 'touch') this.tactile = true;

    // Le curseur reste capté même si le doigt sort du canvas : sans ça, un
    // glisser qui déborde sur le HUD interromprait le déplacement de caméra.
    this.canvas.setPointerCapture?.(e.pointerId);

    this.contacts.set(e.pointerId, {
      x: p.x,
      y: p.y,
      departX: p.x,
      departY: p.y,
      debut: performance.now(),
      type: e.pointerType,
      bouton: e.button,
      aGlisse: false,
    });

    this.pointeur.x = p.x;
    this.pointeur.y = p.y;
    if (e.pointerType !== 'mouse') this.pointeur.sur = true;

    const paire = this.paire();
    if (paire) {
      // Deuxième doigt : on bascule en pincement et on oublie le geste en cours.
      this.pince = true;
      this.ecartPince = Math.hypot(paire[0].x - paire[1].x, paire[0].y - paire[1].y);
      this.milieuPince = {
        x: (paire[0].x + paire[1].x) / 2,
        y: (paire[0].y + paire[1].y) / 2,
      };
      for (const c of this.contacts.values()) c.aGlisse = true;
    }
  };

  private surMouvement = (e: PointerEvent): void => {
    const p = this.position(e);
    const c = this.contacts.get(e.pointerId);

    // Souris sans bouton enfoncé : simple survol, il pilote la tuile visée.
    if (!c) {
      if (e.pointerType === 'mouse') {
        this.pointeur.x = p.x;
        this.pointeur.y = p.y;
        this.pointeur.sur = this.dansLeCanvas(p);
      }
      return;
    }

    const dx = p.x - c.x;
    const dy = p.y - c.y;
    c.x = p.x;
    c.y = p.y;
    if (Math.hypot(p.x - c.departX, p.y - c.departY) > SEUIL_GLISSER) c.aGlisse = true;

    if (this.pince) {
      this.majPincement();
      return;
    }

    this.pointeur.x = p.x;
    this.pointeur.y = p.y;

    if (c.type === 'mouse') {
      // Souris : le glisser-caméra reste sur le bouton droit ou la molette.
      this.pointeur.sur = this.dansLeCanvas(p);
      if (c.bouton === 1 || c.bouton === 2) {
        this.panEnAttente.x += dx;
        this.panEnAttente.y += dy;
      }
      return;
    }

    // Tactile : un outil en main veut dire « je vise », pas « je déplace ».
    if (!this.modePlacement) {
      this.panEnAttente.x += dx;
      this.panEnAttente.y += dy;
    }
  };

  /** Zoom + déplacement induits par le mouvement relatif des deux doigts. */
  private majPincement(): void {
    const paire = this.paire();
    if (!paire) return;
    const [a, b] = paire;
    const ecart = Math.hypot(a.x - b.x, a.y - b.y);
    const milieu = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    if (this.ecartPince > 0 && ecart > 0) {
      const facteur = ecart / this.ecartPince;
      // Sous 0,3 % de variation, c'est du tremblement de doigt : on ignore.
      if (Math.abs(facteur - 1) > 0.003) this.onZoom(milieu.x, milieu.y, facteur);
    }
    this.panEnAttente.x += milieu.x - this.milieuPince.x;
    this.panEnAttente.y += milieu.y - this.milieuPince.y;

    this.ecartPince = ecart;
    this.milieuPince = milieu;
  }

  private surRelache = (e: PointerEvent): void => {
    const c = this.contacts.get(e.pointerId);
    if (!c) return;
    this.contacts.delete(e.pointerId);
    this.canvas.releasePointerCapture?.(e.pointerId);

    // Un pincement ne se termine que quand les deux doigts sont partis, et il ne
    // produit jamais de clic : on ne pose pas une tour en relâchant un zoom.
    if (this.pince) {
      if (this.contacts.size === 0) this.pince = false;
      // Le doigt restant reprend la main sans saut de caméra.
      this.ecartPince = 0;
      return;
    }

    const p = this.position(e);
    const duree = performance.now() - c.debut;

    if (c.type === 'mouse') {
      if (c.bouton === 0) {
        if (this.dansLeCanvas(p)) this.clics.push({ x: p.x, y: p.y, bouton: 0 });
      } else if (c.bouton === 1 || c.bouton === 2) {
        // Un clic droit sans déplacement vaut « annuler », un glisser vaut caméra.
        if (!c.aGlisse) this.clics.push({ x: p.x, y: p.y, bouton: 2 });
      }
      return;
    }

    // Tactile.
    if (!this.dansLeCanvas(p)) {
      this.pointeur.sur = false;
      return;
    }
    if (this.modePlacement) {
      // On pose là où le doigt a fini, glisser compris : c'est le geste « viser ».
      this.clics.push({ x: p.x, y: p.y, bouton: 0 });
      this.pointeur.x = p.x;
      this.pointeur.y = p.y;
      return;
    }
    if (c.aGlisse) {
      this.pointeur.sur = false;
      return;
    }
    // Appui long immobile : équivalent du clic droit, pour désélectionner.
    this.clics.push({ x: p.x, y: p.y, bouton: duree > DUREE_APPUI_LONG ? 2 : 0 });
  };

  private surAnnulation = (e: PointerEvent): void => {
    this.contacts.delete(e.pointerId);
    if (this.contacts.size < 2) this.ecartPince = 0;
    if (this.contacts.size === 0) {
      this.pince = false;
      if (e.pointerType !== 'mouse') this.pointeur.sur = false;
    }
  };

  private surMolette = (e: WheelEvent): void => {
    e.preventDefault();
    const p = this.position(e);
    this.onZoom(p.x, p.y, e.deltaY > 0 ? 0.88 : 1.14);
  };

  private surTouche = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    // Espace : évite de re-déclencher le bouton focalisé. Tab : évite de sortir du canvas.
    if (k === ' ' || k === 'tab') e.preventDefault();
    if (!this.touches.has(k)) this.touchesPressees.push(k);
    this.touches.add(k);
  };

  /** Zoom déclenché par l'interface (boutons + / −), centré sur le plateau. */
  zoomBouton(facteur: number): void {
    this.onZoom(this.canvas.clientWidth / 2, this.canvas.clientHeight / 2, facteur);
  }

  prendreClics(): Clic[] {
    const c = this.clics;
    this.clics = [];
    return c;
  }

  prendreTouches(): string[] {
    const t = this.touchesPressees;
    this.touchesPressees = [];
    return t;
  }

  prendrePan(): { x: number; y: number } {
    const p = { ...this.panEnAttente };
    this.panEnAttente.x = 0;
    this.panEnAttente.y = 0;
    return p;
  }

  estEnfoncee(...keys: string[]): boolean {
    return keys.some((k) => this.touches.has(k));
  }
}
