# AGENTS.md

## Runtime
- This is a small evergreen Node TypeScript/Express service run directly with native Node TypeScript stripping; there is no compile step in normal development.
- Main entrypoint is `src/server.ts`; `npm start` runs `node ./src/server.ts`, and `npm run dev` runs `nodemon` for local restarts.
- Express views live under `src/views`; because the app runs from TypeScript source, a future build step must copy EJS views or adjust the view path.

## Commands
- Use `npm install` for local setup; docs and scripts are npm-based.
- `npm run dev` starts the local watched service; `npm start` starts the service without a watcher.
- Use `npm run check` or `npm run typecheck` for a focused TypeScript check. There are no `test`, `lint`, or `build` scripts.
- Windows service commands are `npm run windows-install` and `npm run windows-uninstall`; both execute TypeScript files under `deploy/windows` via `node`.
- `npm run docker-package` builds a Docker image and saves `web-integrations-template-docker-image.tar`.

## Config And Secrets
- `local.settings.json` is gitignored and must not be committed; start it with `{ "$schema": "./local.settings.schema.json" }` and use the schema for required keys.
- Runtime settings are read from `local.settings.json` first, then environment variables. `local.settings.json` uses a top-level `Values` object.
- Required settings in the schema are `AZURE_CUSTOM_HEADER_TOKEN`, `SERVICE_TYPE`, `WEB_INTEGRATIONS_API_KEY`, and `WEBSITE_BLOB_SAS`; `PORT` defaults to `3000`.
- Auth is bypassed for localhost unless `NODE_ENV=production`; otherwise requests need either header `token` matching `AZURE_CUSTOM_HEADER_TOKEN` or query `apiKey` matching `WEB_INTEGRATIONS_API_KEY`.

## Deployment Notes
- The Dockerfile uses `node:slim`, copies `package*.json`, runs `npm ci --omit=dev`, sets `NODE_ENV=production`, and exposes `/healthz`; keep `package-lock.json` current or Docker/CI installs will fail.
- Docker deployments should provide environment variables matching `local.settings.schema.json`; `local.settings.json` is intentionally not copied into the image.
- CI typechecking is active at `.github/workflows/ci.yml`; the Docker publishing workflow remains an optional template at `deploy/docker/github-workflows-docker.yml` until moved to `.github/workflows/docker.yml`.
- The Windows service definition runs `src/server.ts` directly through Node.
