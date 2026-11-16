# Build the web app and server bundle, then ship only what runs.
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:26-slim
ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_DIR=/app/dist/web \
    GEOIP_DB=/app/data/dbip-country-lite.mmdb
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node data/dbip-country-lite.mmdb ./data/
USER node
EXPOSE 8080
CMD ["node", "dist/server/index.js"]
