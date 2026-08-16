import type { TypeUnite } from '../game/army';
import type { Instantane } from './snapshot';
import {
  CHEMIN_WS,
  decoder,
  encoder,
  type JoueurSalon,
  type MsgClient,
  type MsgServeur,
  type ReglagesPartie,
} from './protocole';

export type EtatReseau = 'hors-ligne' | 'connexion' | 'salon' | 'partie' | 'erreur';

export interface EcouteursReseau {
  onSalon?: (joueurs: JoueurSalon[], maPlace: number, code: string) => void;
  onReglages?: (r: ReglagesPartie) => void;
  onDemarrer?: (r: ReglagesPartie) => void;
  onArmee?: (unites: TypeUnite[]) => void;
  onInstantane?: (s: Instantane) => void;
  onFin?: (victoire: boolean, raison: string) => void;
  onAdversaireParti?: () => void;
  onEtat?: (etat: EtatReseau, message: string) => void;
}

/**
 * Client WebSocket du 1 vs 1. Ne connaît rien du jeu : il traduit des messages en
 * appels d'écouteurs, que `main.ts` branche sur la partie locale.
 */
export class Reseau {
  private ws: WebSocket | null = null;
  etat: EtatReseau = 'hors-ligne';
  message = '';
  joueurs: JoueurSalon[] = [];
  maPlace = 0;
  code = '';

  constructor(private readonly ecouteurs: EcouteursReseau) {}

  get connecte(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  get suisHote(): boolean {
    return this.maPlace === 0;
  }

  /**
   * URL par défaut : la même origine que la page. On suit son protocole, sinon
   * une page en https refuserait une socket en clair (contenu mixte).
   */
  static urlParDefaut(): string {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host || `localhost:${location.port || 80}`}${CHEMIN_WS}`;
  }

  connecter(url: string, salon: string, pseudo: string): void {
    this.fermer();
    this.majEtat('connexion', `Connexion à ${url}…`);

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.majEtat('erreur', 'URL de serveur invalide.');
      return;
    }
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.envoyer({ t: 'rejoindre', salon, pseudo });
      this.majEtat('salon', 'Connecté, en attente de l’adversaire…');
    });

    ws.addEventListener('message', (e) => {
      const m = decoder<MsgServeur>(String(e.data));
      if (m) this.traiter(m);
    });

    ws.addEventListener('close', () => {
      if (this.etat !== 'erreur') this.majEtat('hors-ligne', 'Déconnecté du serveur.');
      this.ws = null;
    });

    ws.addEventListener('error', () => {
      this.majEtat(
        'erreur',
        'Impossible de joindre le serveur. Lancez-le avec « npm run serveur ».',
      );
    });
  }

  private traiter(m: MsgServeur): void {
    switch (m.t) {
      case 'salon':
        this.joueurs = m.joueurs;
        this.maPlace = m.maPlace;
        this.code = m.code;
        this.ecouteurs.onSalon?.(m.joueurs, m.maPlace, m.code);
        if (this.etat !== 'partie') {
          this.majEtat(
            'salon',
            m.joueurs.length < 2
              ? `Salon ${m.code} — en attente d’un adversaire`
              : `Salon ${m.code} — deux joueurs connectés`,
          );
        }
        break;
      case 'reglages':
        this.ecouteurs.onReglages?.(m.reglages);
        break;
      case 'demarrer':
        this.majEtat('partie', 'Partie en cours');
        this.ecouteurs.onDemarrer?.(m.reglages);
        break;
      case 'armee':
        this.ecouteurs.onArmee?.(m.unites);
        break;
      case 'instantane':
        this.ecouteurs.onInstantane?.(m.s);
        break;
      case 'fin':
        this.majEtat('salon', m.raison);
        this.ecouteurs.onFin?.(m.victoire, m.raison);
        break;
      case 'adversaireParti':
        this.ecouteurs.onAdversaireParti?.();
        break;
      case 'erreur':
        this.majEtat('erreur', m.message);
        break;
    }
  }

  private majEtat(etat: EtatReseau, message: string): void {
    this.etat = etat;
    this.message = message;
    this.ecouteurs.onEtat?.(etat, message);
  }

  private envoyer(m: MsgClient): void {
    if (this.connecte) this.ws?.send(encoder(m));
  }

  annoncerPret(pret: boolean): void {
    this.envoyer({ t: 'pret', pret });
  }

  proposerReglages(reglages: ReglagesPartie): void {
    this.envoyer({ t: 'reglages', reglages });
  }

  envoyerArmee(unites: TypeUnite[]): void {
    if (unites.length) this.envoyer({ t: 'armee', unites });
  }

  envoyerInstantane(s: Instantane): void {
    this.envoyer({ t: 'instantane', s });
  }

  annoncerFin(victoire: boolean, vies: number, vague: number): void {
    this.envoyer({ t: 'termine', victoire, vies, vague });
  }

  fermer(): void {
    this.ws?.close();
    this.ws = null;
  }
}
