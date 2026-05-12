# AGENTS.md

## Runtime
- Self-hosted, Azure-Functions-style integrations runtime. Small Node + Express service, runs directly via native Node TypeScript stripping; no compile step.
- Main entrypoint is `src/server.ts`; `npm start` runs `node ./src/server.ts`, and `npm run dev` runs `node --watch ./src/server.ts` for local restarts.
- The source tree separates runtime from user code by folder name:
  - `src/runtime/` - framework: registry, scheduler, openapi, auth, log, settings. Don't normally touch.
  - `src/actions/` - your action handlers. `sample-*.ts` are starters; `index.ts` is the registration sink.
  - `src/helpers/` - your shared helpers. `sample-upload-blob.ts` is the starter example.
  - `src/config/windows-service.ts` - Windows service name + node-windows definition.
  - `src/views/` - EJS templates. `src/public/` - static assets.
  - `src/server.ts` - entrypoint, rarely needs editing.
- Imports across the boundary are visible: action files do `import { defineAction } from "../runtime/registry.ts"`.
- Frontend uses hand-rolled `src/public/styles.css` with Clear Path Research brand tokens (warm grays, coral accent, OKLCH palette, dark/light via `prefers-color-scheme` + `.light` class). Poppins + JetBrains Mono are loaded from Google Fonts. No CSS framework; no JS framework. Each action card has an inline output panel - clicking Run reveals it and streams in place. No modal/dialog.
- A short README lives at `src/actions/README.md` for users opening a freshly cloned template.

## Actions
- Integration handlers live under `src/actions/` and register themselves with `defineAction(...)` from `src/actions/registry.ts`. Routes (`/action/:name`) and the index page are auto-driven by the registry. Add a new action by dropping a file in `src/actions/` and importing it from `src/actions/index.ts`.
- Positioning: this is a **bridge-product** for the messy middle of cloud migration. The action signature is deliberately close to Azure Functions v4 so handlers port with cosmetic changes once on-prem constraints clear. README's intro and "When you'd / when you'd *not*" sections carry this framing. Don't reposition it as a destination runtime.
- An action takes one of three forms, all supporting optional `timeoutMs`, `onSuccess(result, ctx)`, `schedule` (cron), `method` (`"GET"` default or `"POST"`), and `auth` level:
  - **handler**: `handler: (ctx) => result` - one-shot request/response. Result is JSON-wrapped as `{ action, result }`.
  - **steps**: `steps: ["a", "b"]` - sequence of other registered actions, run in order. Streamed over HTTP as NDJSON, one line per step transition (`{ step, status: "started" | "done" | "failed" | "progress", result?, error?, at }`). On first failure the sequence stops. Sequences can contain stream actions; their yields are wrapped as `progress` events.
  - **stream**: `stream: async function*(ctx) { yield ... }` - async generator. Each yield becomes one NDJSON line. `timeoutMs` here means "max idle between yields". The generator's `return` value is passed to `onSuccess`.
- `ctx` is a discriminated union of `HttpContext` (`trigger: "http"`, has `req`/`res`) and `ScheduleContext` (`trigger: "schedule"`, no `req`/`res`). Use `httpCtx(ctx)` from `runtime/registry.ts` to narrow when you need `req`/`res` (e.g. POST actions reading the body) - it throws if invoked from the scheduler.
- Migration-ease fields on both contexts: `ctx.log("...")` (with `.info`/`.warn`/`.error` methods) mirrors Azure Functions `context.log`. `ctx.invocationId` is an alias for `ctx.requestId` matching Functions naming. Handlers using these are syntactically closer to a Functions handler body.
- Return-shape compatibility: a handler may return `httpResponse({ status, jsonBody, headers, body })` (or a duck-typed object with those fields). The route emits the response init directly instead of wrapping. Plain return values still work and get wrapped as `{ action, result }`. `httpResponse` is identity at runtime; it's just a typed helper.
- Cron schedules accept both 5-field cron and 6-field NCRONTAB (`{second minute hour day month weekday}`). Functions-style schedules like `"0 */15 * * * *"` work and stay portable to Azure Functions Timer triggers.
- POST actions: set `method: "POST"`. The runtime returns 405 if the wrong verb is used. JSON bodies are parsed up to 1MB via the global `express.json` middleware; access via `httpCtx(ctx).req.body`.
- Example recipes live in `src/actions/examples/` (inert by default - typechecked, not auto-registered). Cover SQL Server → blob, inbound webhook with HMAC verify, and SharePoint list sync via Graph + msal-node. Users copy / import to activate.
- The bundled `src/public/app.js` content-type-sniffs the response: handler results render as JSON, sequences and streams render line-by-line into the card's inline output panel as they arrive.
- Handlers should be **idempotent**: running the same action twice should leave the system in the same end state. Schedulers retry on failure and humans double-click buttons.
- An observability-init comment block at the top of `src/server.ts` marks where to import a tracer (New Relic, OTel, Datadog) so it can patch modules before they load.

## API docs
- `GET /openapi.json` - auto-generated OpenAPI 3.0 spec built from `getActions()`. Each action becomes a path entry tagged by kind (`handler` / `sequence` / `stream` / `scheduled`), with per-action security mapped from `action.auth`.
- `GET /docs` - Swagger UI page loading the spec. Helmet's CSP is widened just enough to allow Swagger UI assets from `cdnjs.cloudflare.com`.
- Both routes are gated by the global auth middleware. Update `src/openapi.ts` to add response schemas per action when callers need richer docs.

## Triggering actions
Two ways, use either or both:
- **External (recommended for visibility)**: Windows Task Scheduler / cron / Azure App Proxy webhooks hit `/action/:name` over HTTP. An on-prem admin sees scheduled jobs where they expect to find them, in Task Scheduler.
- **Internal**: set `schedule: "*/15 * * * *"` on the action definition. `src/scheduler.ts` registers cron jobs at boot via `node-cron`. Stream actions can't be scheduled internally (they need a Response to write to); use HTTP for those.
The same action is callable both ways simultaneously - define once, trigger from either.

## Auth
- Global default: header `token` matching `AZURE_CUSTOM_HEADER_TOKEN`, or query `apiKey` matching `WEB_INTEGRATIONS_API_KEY`. Both compared with `crypto.timingSafeEqual`. Loopback (`127.0.0.1`/`::1`) bypass applies only when `SERVICE_TYPE=dev`.
- Per-action override via `auth: "anonymous" | "key" | "proxy"`:
  - `anonymous` - no auth at all. Use sparingly (e.g. public webhook receivers that bring their own HMAC).
  - `key` (default) - global rule above.
  - `proxy` - only the header `token` is accepted; query `apiKey` is rejected. Use for actions meant to be human-driven through Azure App Proxy.
- Auth credentials are read once at module load. Rotating `AZURE_CUSTOM_HEADER_TOKEN` or `WEB_INTEGRATIONS_API_KEY` requires a process restart to take effect.

## Config and secrets
- `local.settings.json` is gitignored and must not be committed; start it with `{ "$schema": "./local.settings.schema.json" }` and use the schema for required keys.
- Runtime settings are read from `local.settings.json` first, then environment variables. `local.settings.json` uses a top-level `Values` object.
- Required settings: `AZURE_CUSTOM_HEADER_TOKEN`, `SERVICE_TYPE`, `WEB_INTEGRATIONS_API_KEY`, `WEBSITE_BLOB_SAS`. Optional: `PORT` (default `3000`), `CORS_ORIGINS` (comma-separated allowed origins; CORS disabled if blank).

## Commands
- Use `npm install` for local setup. The project ships `package-lock.json`. Stick with npm; pnpm/yarn add justification an enterprise admin will ask about and offer no benefit for this audience.
- `npm run dev` starts the local watched service; `npm start` starts without a watcher.
- `npm run check` / `npm run typecheck` for TypeScript checking. No `test`, `lint`, or `build` scripts.
- Windows service: `npm run windows-install` / `npm run windows-uninstall`; both execute TypeScript files under `deploy/windows` via `node`.
- `npm run configure` runs `scripts/configure.ts` to write `local.settings.json` interactively (random UUIDs for the two secrets, `SERVICE_TYPE=dev` default). The file is written with mode 0600.
- `npm run docker-package` builds a Docker image and saves `az-functions-onprem-docker-image.tar`.

## Common on-prem integration packages
Not bundled; install on demand when you need them.
- **`mssql`** - Dynamics, internal data warehouses, anything talking to SQL Server. Use a connection pool; close on shutdown.
- **`@azure/msal-node`** - Azure AD app/user auth for Microsoft Graph, SharePoint, Dataverse, Power Platform APIs.
- **`@azure/storage-blob`** - already bundled. Used by `src/helpers/sample-upload-blob.ts`.
- **`ldapjs`** or **`activedirectory2`** - Active Directory lookups (groups, users) for legacy on-prem identity.
- **`nodemailer`** - SMTP relay for sending operational alerts via Exchange / O365 SMTP.
- **`ssh2-sftp-client`** - SFTP file drops; common with legacy ERP/EDI partners.
- **`undici`** or native `fetch` - outbound HTTP/OData calls; `undici` lets you set per-host agents (mTLS client certs).
- **`pino`** - structured JSON logging once `console.log` is no longer enough. Slot it into `src/runtime/log.ts`.

## Deployment notes
- The Dockerfile uses `node:slim`, copies `package*.json`, runs `npm ci --omit=dev`, sets `NODE_ENV=production`, and exposes `/healthz`. Keep `package-lock.json` current or Docker/CI installs will fail.
- Docker deployments should provide environment variables matching `local.settings.schema.json`; `local.settings.json` is intentionally not copied into the image.
- CI typechecking is active at `.github/workflows/ci.yml`; the Docker publishing workflow remains an optional template at `deploy/docker/github-workflows-docker.yml` until moved to `.github/workflows/docker.yml`.
- The Windows service definition runs `src/server.ts` directly through Node.
