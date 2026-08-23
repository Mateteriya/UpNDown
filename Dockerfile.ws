# Game server image (WebSocket + HTTP health). Build from repo root:
#   docker build -f Dockerfile.ws -t updown-ws .
#   docker run -d --name updown-ws --restart unless-stopped \
#     -p 127.0.0.1:3001:3001 \
#     --env-file /etc/updown/ws.env \
#     -e PUBLIC_WS_URL=wss://game.example.com \
#     -e WS_AUTH=required \
#     -e HOST=0.0.0.0 \
#     -v updown-ws-data:/var/lib/updown \
#     updown-ws

FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/

RUN npm ci && npm run server:install

COPY server ./server
COPY src/game ./src/game

RUN npm run build --prefix server

ENV NODE_ENV=production
ENV UPDOWN_MODE=prod
ENV PORT=3001
ENV HOST=0.0.0.0
ENV WS_BACKUP_PORTS=none
ENV ROOM_PERSIST=1
ENV ROOM_PERSIST_PATH=/var/lib/updown/rooms.json
ENV ROOM_BACKUP_KEEP=144
ENV WS_AUTH=required
ENV WS_TRUST_PROXY=1

RUN mkdir -p /var/lib/updown

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
