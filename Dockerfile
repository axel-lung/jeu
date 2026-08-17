# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Étape 1 — build du client.
# Les devDependencies (TypeScript, Vite) ne servent qu'ici : elles ne suivront
# pas dans l'image finale.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Les dépendances d'abord : cette couche n'est réinstallée que si les
# manifestes changent, pas à chaque modification du jeu.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
# Manifeste PWA, service worker et icônes : Vite les recopie tels quels dans dist/.
COPY public ./public

# `npm run build` = vérification des types + bundle. Le build échoue donc si le
# TypeScript ne compile pas : on ne déploie jamais une image qui ne type-check pas.
RUN npm run build

# ---------------------------------------------------------------------------
# Étape 2 — image d'exécution.
# Le serveur ne dépend que de `ws` ; tout le reste est du statique déjà bundlé.
# ---------------------------------------------------------------------------
FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY --from=build /app/dist ./dist

# L'image node fournit déjà un utilisateur non privilégié : rien ici n'a besoin
# d'écrire sur le disque, les salons vivent en mémoire.
USER node

EXPOSE 8080

# Vérifie que le serveur répond vraiment, pas juste que le process est vivant.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/serveur.mjs"]
