import './style.css';
import { Input } from './core/input';
import {
  enregistrerServiceWorker,
  estTactile,
  neutraliserGestesNavigateur,
  passerEnPaysage,
} from './core/mobile';
import { Game } from './game/game';
import { Renderer } from './render/renderer';
import { Hud } from './ui/hud';
import { Reseau } from './net/client';
import { PERIODE_INSTANTANE } from './net/snapshot';

const canvas = document.getElementById('jeu') as HTMLCanvasElement;
const game = new Game();
const renderer = new Renderer(canvas, game);

/**
 * Câblage réseau du 1 vs 1.
 *
 * `hud` est déclaré plus bas mais n'est référencé qu'à l'intérieur de rappels, qui
 * ne se déclenchent jamais avant la fin de l'initialisation du module.
 */
const reseau = new Reseau({
  onSalon: (joueurs, maPlace) => hud.majSalon(joueurs, maPlace),
  onReglages: (r) => {
    // Seul l'invité applique les réglages reçus ; l'hôte est déjà à jour.
    if (!reseau.suisHote) game.previsualiser(r);
  },
  onDemarrer: (r) => {
    // Même carte des deux côtés : en compétitif, la symétrie prime. La place dans
    // le salon décide du côté joué — hôte à gauche, invité à droite.
    game.previsualiser(r, true);
    game.demarrer('duel', reseau.suisHote ? 'a' : 'b');
  },
  onArmee: (unites) => game.recevoirArmee(unites),
  onInstantane: (s) => game.vueAdverse.recevoir(s),
  onFin: (victoire, raison) => {
    hud.raisonFin = raison;
    hud.reinitialiserPret();
    game.terminerDepuisReseau(victoire);
  },
  onAdversaireParti: () => game.vueAdverse.vider(),
  onEtat: (etat, message) => hud.majEtatReseau(etat, message),
});

const hud = new Hud(game, {
  // `passerEnPaysage` est appelé dans la foulée du clic : le plein écran et le
  // verrou d'orientation exigent un geste utilisateur, ils échoueraient plus tard.
  onSolo: () => {
    passerEnPaysage();
    game.demarrer('solo');
  },
  onConnecter: (url, salon, pseudo) => reseau.connecter(url, salon, pseudo),
  onPret: (pret) => {
    if (pret) passerEnPaysage();
    reseau.annoncerPret(pret);
  },
  onReglages: () => {
    if (reseau.suisHote && reseau.connecte) reseau.proposerReglages({ ...game.options });
  },
  onZoom: (facteur) => input.zoomBouton(facteur),
});

game.onArmeeEnvoyee = (unites) => reseau.envoyerArmee(unites);
game.onFinPartie = (victoire) => {
  if (game.mode === 'duel') reseau.annoncerFin(victoire, game.vies, game.vague);
};

const input = new Input(canvas, (sx, sy, facteur) => game.camera.zoomVers(sx, sy, facteur));

neutraliserGestesNavigateur();
enregistrerServiceWorker();
hud.tactile = estTactile();

renderer.redimensionner();
window.addEventListener('resize', () => renderer.redimensionner());
// Rotation de l'écran et apparition/disparition de la barre d'URL mobile : la
// taille change après coup, d'où le second passage différé.
window.addEventListener('orientationchange', () => {
  renderer.redimensionner();
  setTimeout(() => renderer.redimensionner(), 250);
});
window.visualViewport?.addEventListener('resize', () => renderer.redimensionner());

function traiterTouches(): void {
  for (const k of input.prendreTouches()) {
    if (game.phase === 'menu') {
      // Dans le menu, tout passe par la souris : les champs texte doivent rester libres.
      continue;
    }
    // Les chiffres sélectionnent la n-ième carte de la boutique affichée.
    if (k >= '1' && k <= '9') {
      hud.activerCarte(Number(k) - 1);
      continue;
    }
    switch (k) {
      case 'tab':
        game.basculerZone();
        break;
      case 'v':
        game.basculerVitesse();
        break;
      case 'c':
        if (game.selection?.cat === 'tour') game.cyclerCible(game.selection.tour);
        break;
      case 'u':
        if (game.selection?.cat === 'tour') game.ameliorer(game.selection.tour);
        break;
      case 'escape':
        game.outil = null;
        game.selection = null;
        break;
      case 'r':
        if (game.mode === 'solo' && (game.phase === 'victoire' || game.phase === 'defaite')) {
          game.rejouer();
        }
        break;
      case 'm':
        if (game.phase === 'victoire' || game.phase === 'defaite') game.retourMenu();
        break;
    }
  }
}

function traiterCamera(dt: number): void {
  const pan = input.prendrePan();
  if (pan.x || pan.y) game.camera.panScreen(pan.x, pan.y);

  let dx = 0;
  let dy = 0;
  if (input.estEnfoncee('a', 'q', 'arrowleft')) dx -= 1;
  if (input.estEnfoncee('d', 'arrowright')) dx += 1;
  if (input.estEnfoncee('w', 'z', 'arrowup')) dy -= 1;
  if (input.estEnfoncee('s', 'arrowdown')) dy += 1;
  if (dx || dy) game.panClavier(dx, dy, dt);
}

/** Le curseur reflète l'action possible sous la souris. Sans objet au doigt. */
function majCurseur(): void {
  if (input.tactile) return;
  const { outil, survol } = game;
  if (outil) {
    canvas.style.cursor =
      survol && game.posableSur(outil, survol.gx, survol.gy) ? 'copy' : 'not-allowed';
    return;
  }
  const cliquable =
    survol !== null &&
    (game.tourEn(survol.gx, survol.gy) !== null ||
      game.bebeEn(survol.gx, survol.gy) !== null ||
      game.batimentEn(survol.gx, survol.gy) !== null);
  canvas.style.cursor = cliquable ? 'pointer' : 'default';
}

let dernier = performance.now();
let prochainStatut = 0;

function boucle(maintenant: number): void {
  // dt plafonné : après un changement d'onglet, on ne veut pas rattraper 10 s d'un coup.
  const dt = Math.min((maintenant - dernier) / 1000, 0.05);
  dernier = maintenant;

  traiterTouches();
  traiterCamera(dt);

  for (const clic of input.prendreClics()) {
    if (clic.bouton === 0) game.clicGauche(clic.x, clic.y);
    else game.clicDroit();
  }

  game.maj(dt, input.pointeur.x, input.pointeur.y, input.pointeur.sur);
  renderer.dessiner();
  // Un outil en main change la grammaire du geste à un doigt : viser au lieu de
  // déplacer la caméra. L'entrée doit le savoir avant le prochain contact.
  input.modePlacement = game.outil !== null;
  hud.tactile = hud.tactile || input.tactile;
  hud.maj();
  majCurseur();

  // Photo de notre plateau 4 fois par seconde : c'est ce que l'adversaire affiche
  // en face, interpolé entre deux envois.
  if (game.mode === 'duel' && maintenant > prochainStatut) {
    prochainStatut = maintenant + PERIODE_INSTANTANE;
    if (game.phase === 'preparation' || game.phase === 'vague') {
      reseau.envoyerInstantane(game.instantane());
    }
  }

  requestAnimationFrame(boucle);
}

requestAnimationFrame(boucle);
