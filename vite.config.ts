import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: true,
    // En production, le jeu et le 1 vs 1 sortent du même port. On reproduit ça en
    // développement pour que le client vise toujours `/ws` sur sa propre origine,
    // sans URL de serveur à saisir ni cas particulier dans le code.
    proxy: { '/ws': { target: 'ws://localhost:8080', ws: true } },
  },
  build: { target: 'es2022' },
});
