# Fly.io image: the Node server (server/index.js) serves the static site AND the WebSocket room relay at /ws
# on port 8080 (see fly.toml). PORT is set, so the server binds 0.0.0.0. Rooms live in this process's memory.
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY index.html ./index.html
COPY shared/ ./shared/
COPY games/ ./games/
COPY join/ ./join/
COPY shield/ ./shield/
COPY server/ ./server/
USER node
EXPOSE 8080
CMD ["node", "server/index.js"]
