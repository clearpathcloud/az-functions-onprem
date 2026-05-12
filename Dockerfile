# Use the official Node.js image as the base image
FROM node:24-slim

LABEL org.opencontainers.image.title="az-functions-onprem"
LABEL org.opencontainers.image.description="Self-hosted, Azure-Functions-style integrations runtime for Windows Server or Docker."
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.source="https://github.com/alirobe/az-functions-onprem"

ENV NODE_ENV=production

# Set the working directory inside the image
WORKDIR /app

# Copy lockfile + manifest into the image
COPY package*.json ./
# DO NOT COPY .env OR local.settings.json INTO THE IMAGE

# Install runtime dependencies
RUN npm ci --omit=dev

# Copy the remaining application files into the image
COPY src ./src/

USER node

# Expose the port your application will run on
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start the application
CMD ["npm", "start"]
