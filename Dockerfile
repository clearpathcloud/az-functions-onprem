FROM node:24-slim

LABEL org.opencontainers.image.title="az-functions-onprem"
LABEL org.opencontainers.image.description="Self-hosted, Azure-Functions-style integrations runtime for Windows Server or Docker."
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.source="https://github.com/alirobe/az-functions-onprem"

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
# local.settings.json and .env stay outside the image.

RUN npm ci --omit=dev

COPY src ./src/

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.FN_PORT || 3000) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start Node directly so container signals reach the app's shutdown handler.
CMD ["node", "./src/server.ts"]
