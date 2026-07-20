# Game server image (WebSocket + HTTP health). Build from repo root:
#   docker build -f Dockerfile.ws -t updown-ws .
#   docker run -d --name updown-ws --restart unless-stopped \
#     -p 127.0.0.1:3001:3001 \
#     -e PUBLIC_WS_URL=wss://game.example.com \
#     -v updown-ws-data:/app/server/data \
#     updown-ws

FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/

RUN npm ci && npm run server:install

COPY server ./server
COPY src/game ./src/game

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV WS_BACKUP_PORTS=none
ENV ROOM_PERSIST=1
ENV ROOM_PERSIST_PATH=/app/server/data/rooms.json

RUN mkdir -p /app/server/data

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start", "--prefix", "server"]
