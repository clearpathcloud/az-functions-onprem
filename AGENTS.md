# AGENTS.md

Read `README.md` for what this is and how to author actions. This file flags things contributors and agents won't pick up from reading the code.

## Positioning

- Action signatures are deliberately close to Azure Functions v4 so handlers port with cosmetic changes. Don't reposition the template as something it isn't.
- No support. The README has an explicit as-is line; don't add copy that implies maintenance, SLAs, or upgrade-urgency obligations.

## Source tree

- `src/runtime/` — framework (registry, scheduler, openapi, auth, log, settings). Don't normally touch.
- `src/actions/` — user actions. `sample-*.ts` are starter examples; `index.ts` is the registration sink; `examples/` holds inert recipes.
- `src/helpers/` — user helpers (e.g. `sample-upload-blob.ts`).
- `src/config/windows-service.ts` — Windows service definition.
- `src/views/`, `src/public/` — EJS + static assets. Stylesheet is hand-rolled; no Tailwind / Pico / build step.
- `src/server.ts` — entrypoint, rarely needs editing.
- Boundary cue: action files do `import { defineAction } from "../runtime/registry.ts"` — the relative path makes the framework boundary visible.
- `src/actions/README.md` is the on-ramp for a freshly cloned template.

## Action runtime notes (things not obvious from the type definitions)

- Three forms: handler / `steps` / `stream`. All accept `timeoutMs`, `onSuccess`, `schedule`, `methods`, `authLevel`, `concurrency`.
- Handler signature is `(request, context)` matching Functions v4. `request` is `HttpRequest | undefined` because actions can also be triggered by the scheduler (Functions splits these into `app.http()` + `app.timer()` registrations; we unify). For HTTP-only actions, call `requireRequest(request)` at the top to assert + narrow.
- `context.log`, `context.invocationId`, and `httpResponse({...})` match Functions v4 by name. Request body is `request.body` (sync, Express-parsed); Functions v4 is `await request.json()` - the one unavoidable migration delta. The `x-request-id` HTTP header still uses the HTTP-conventional name (separate from the context field).
- Sequences (`steps`) stream NDJSON step transitions. Sequences **can** contain stream actions; their yields wrap as `progress` events. First step failure stops the sequence.
- Scheduled sequences can't include stream actions (no HTTP response to write to). The scheduler refuses such combinations at boot.
- Cron accepts both 5-field standard and 6-field NCRONTAB. Use 6-field for portability to Azure Functions Timer triggers.
- Handlers should be idempotent. Schedulers retry on failure and humans double-click.
- Observability hook: comment block at the top of `src/server.ts` marks where an APM tracer (New Relic, OTel, Datadog) should be imported before anything else.

## Auth

- Default level is **`header`** — only the header `token` matching `FN_AUTH_HEADER` is accepted.
- `authLevel: "key"` additionally accepts query `?apiKey=...` matching `FN_AUTH_KEY`. For scheduled-task callers that can't set headers.
- `authLevel: "anonymous"` skips auth; the handler must verify (HMAC, etc.).
- `crypto.timingSafeEqual` for comparison. Credentials read at module load — rotation needs a restart.
- Loopback (`127.0.0.1`/`::1`) bypasses auth only when `FN_SERVICE_TYPE=dev`.

## SPFx and browser callers

- Demoted in the README to "Browser-callable deployments (advanced)" sitting behind the Security section. Path is Azure App Proxy + tight `FN_CORS_ORIGINS` + per-action `authLevel: "header"`. Direct AAD JWT validation is not built in.
- Action handlers must tolerate concurrent execution; idempotency and no per-call in-memory state are prerequisites. Per-action `concurrency` cap is available; no global semaphore is shipped.

## Config

- `local.settings.json` is the primary mechanism (mirrors Azure Functions). Env vars are fallback — file wins when both are set. Windows admins prefer files; don't lead with env vars in docs unless the path demands it (Docker).
- Schema is permissive (`additionalProperties: true`). `getSettings` has a string overload that returns `undefined` gracefully for unknown keys, so user helpers can read their own settings without modifying the schema.
- Required: `FN_AUTH_HEADER`, `FN_SERVICE_TYPE`, `FN_AUTH_KEY`. Optional: `FN_PORT`, `FN_CORS_ORIGINS` (no `*`; throws at boot if found), `FN_BIND_HOST`, `FN_RATE_LIMIT_PER_MINUTE`.

## Commands

- `npm install`, `npm run dev`, `npm start`, `npm run typecheck` (alias `check`), `npm run configure`, `npm run windows-install` / `npm run windows-uninstall`, `npm run docker-package`.
- npm-only on purpose. pnpm adds a corepack step that an enterprise admin has to justify in a supply-chain audit, with no benefit for this audience.

## Deployment

- Dockerfile uses `node:slim`, copies `package*.json`, runs `npm ci --omit=dev`. Keep `package-lock.json` current.
- Windows service definition runs `src/server.ts` directly via `node-windows`. The default service name is a "rename me" placeholder; the deployer is expected to edit `src/config/windows-service.ts` before installing, so the registered service in `services.msc` doesn't look like a Microsoft product.
- No default CI. Docker publishing template lives at `deploy/docker/github-workflows-docker.yml` until moved into `.github/workflows/`.
