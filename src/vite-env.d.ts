/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * URL WebSocket du serveur de 1 vs 1, fixée au build (cf. `.env.example`).
   * Vide en développement et sur le site : le jeu vise alors sa propre origine.
   */
  readonly VITE_SERVEUR_WS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
