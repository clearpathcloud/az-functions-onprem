# AGENTS.md

## Runtime
- This is a small Node 18.18 TypeScript/Express service run directly with `ts-node`; there is no compile step in normal development.
- Main entrypoint is `src/server.ts`; `npm start` runs `nodemon`, which executes `ts-node ./src/server.ts` and watches `src` plus `local.settings.json`.
- Express views live under `src/views`; because the app runs from TypeScript via `ts-node`, a future build step must copy EJS views or adjust the view path.

## Commands
- Use `npm install` for local setup; docs and scripts are npm-based even though a `pnpm-lock.yaml` exists.
- `npm start` starts the local service.
- There are no `test`, `lint`, `build`, or `typecheck` scripts. After dependencies are installed, use `npx tsc --noEmit` for a focused TypeScript check.
- Windows service commands are `npm run windows-install` and `npm run windows-uninstall`; both execute TypeScript files under `deploy/windows` via `ts-node`.
- `npm run docker-package` builds a Docker image and saves `web-integrations-template-docker-image.tar` using a Windows-style output path.

## Config And Secrets
- `local.settings.json` is gitignored and must not be committed; start it with `{ "$schema": "./local.settings.schema.json" }` and use the schema for required keys.
- Runtime settings are read from `local.settings.json` first, then environment variables. `local.settings.json` uses a top-level `Values` object.
- Required settings in the schema are `AZURE_CUSTOM_HEADER_TOKEN`, `SERVICE_TYPE`, `WEB_INTEGRATIONS_API_KEY`, and `WEBSITE_BLOB_SAS`; `PORT` defaults to `3000`.
- Auth is bypassed for localhost unless `NODE_ENV=production`; otherwise requests need either header `token` matching `AZURE_CUSTOM_HEADER_TOKEN` or query `apiKey` matching `WEB_INTEGRATIONS_API_KEY`.

## Deployment Notes
- The Dockerfile uses `node:18.18-alpine`, copies `package*.json`, and runs `npm ci`; keep `package-lock.json` current or Docker/CI installs will fail.
- Docker deployments should provide environment variables matching `local.settings.schema.json`; `local.settings.json` is intentionally not copied into the image.
- The optional Docker GitHub Actions template is stored at `deploy/docker/github-workflows-docker.yml`; it is not active until moved to `.github/workflows/docker.yml`.
- The Windows service definition runs `node_modules\nodemon\bin\nodemon.js`; the README warns this template uses nodemon even in production and should be hardened before real use.
