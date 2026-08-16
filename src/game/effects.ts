/**
 * Particules et textes flottants.
 *
 * Le document de design demande des « explosions confettis » à la mort des ennemis
 * et des « étoiles noires » quand ils pop : les deux sont ici, plus les chiffres de
 * gain d'or et d'âmes qui remontent au-dessus du kill.
 */

export type FormeParticule = 'confetti' | 'etoile' | 'rond' | 'plume';

export interface Particule {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  vie: number;
  vieMax: number;
  taille: number;
  couleur: string;
  forme: FormeParticule;
  rot: number;
  vrot: number;
}

export interface TexteFlottant {
  x: number;
  y: number;
  z: number;
  texte: string;
  couleur: string;
  vie: number;
  vieMax: number;
}

const COULEURS_CONFETTI = [
  '#ff5b7f',
  '#ffd166',
  '#6fe3a0',
  '#6fd3ff',
  '#c9a7ff',
  '#ffffff',
  '#ff9f45',
];

export class Effets {
  particules: Particule[] = [];
  textes: TexteFlottant[] = [];

  /** Gerbe de confettis colorés : la mort d'un ennemi doit être satisfaisante. */
  confettis(x: number, y: number, z: number, quantite = 14, force = 1): void {
    for (let i = 0; i < quantite; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (40 + Math.random() * 90) * force;
      this.particules.push({
        x,
        y,
        z,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.5,
        vz: 60 + Math.random() * 130 * force,
        vie: 0.6 + Math.random() * 0.5,
        vieMax: 1.1,
        taille: 2.5 + Math.random() * 3,
        couleur: COULEURS_CONFETTI[(Math.random() * COULEURS_CONFETTI.length) | 0],
        forme: 'confetti',
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 14,
      });
    }
  }

  /** Étoiles noires du « pop » — la signature visuelle des ennemis qui éclatent. */
  pop(x: number, y: number, z: number, quantite = 7): void {
    for (let i = 0; i < quantite; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 30 + Math.random() * 60;
      this.particules.push({
        x,
        y,
        z,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.5,
        vz: 40 + Math.random() * 70,
        vie: 0.35 + Math.random() * 0.25,
        vieMax: 0.6,
        taille: 4 + Math.random() * 4,
        couleur: '#16121f',
        forme: 'etoile',
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 8,
      });
    }
  }

  /** Petit éclat à l'impact d'un projectile. */
  impact(x: number, y: number, z: number, couleur: string): void {
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 25 + Math.random() * 45;
      this.particules.push({
        x,
        y,
        z,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.5,
        vz: 20 + Math.random() * 50,
        vie: 0.18 + Math.random() * 0.15,
        vieMax: 0.33,
        taille: 1.8 + Math.random() * 2,
        couleur,
        forme: 'rond',
        rot: 0,
        vrot: 0,
      });
    }
  }

  /** Anneau d'explosion du Coq niveau 4. */
  explosion(x: number, y: number, z: number, rayonMonde: number): void {
    const n = 20;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.particules.push({
        x,
        y,
        z,
        vx: Math.cos(a) * rayonMonde * 1.8,
        vy: Math.sin(a) * rayonMonde * 0.9,
        vz: 20,
        vie: 0.4,
        vieMax: 0.4,
        taille: 3.5,
        couleur: COULEURS_CONFETTI[i % COULEURS_CONFETTI.length],
        forme: 'confetti',
        rot: a,
        vrot: 6,
      });
    }
  }

  texte(x: number, y: number, z: number, texte: string, couleur: string): void {
    this.textes.push({ x, y, z, texte, couleur, vie: 0.9, vieMax: 0.9 });
  }

  maj(dt: number): void {
    const g = 260; // gravité en pixels monde / s²
    for (let i = this.particules.length - 1; i >= 0; i--) {
      const p = this.particules[i];
      p.vie -= dt;
      if (p.vie <= 0) {
        this.particules.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vz -= g * dt;
      p.rot += p.vrot * dt;
      if (p.z < 0) {
        p.z = 0;
        p.vz *= -0.35;
        p.vx *= 0.6;
        p.vy *= 0.6;
      }
    }
    for (let i = this.textes.length - 1; i >= 0; i--) {
      const t = this.textes[i];
      t.vie -= dt;
      t.z += 34 * dt;
      if (t.vie <= 0) this.textes.splice(i, 1);
    }
  }

  vider(): void {
    this.particules.length = 0;
    this.textes.length = 0;
  }
}
