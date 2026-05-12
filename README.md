# az-functions-onprem

[![CI](https://github.com/alirobe/az-functions-onprem/actions/workflows/ci.yml/badge.svg)](https://github.com/alirobe/az-functions-onprem/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2023.6-339933)](https://nodejs.org)

Azure-Functions-style integrations runtime for Windows Server or Docker, behind your firewall.

Necessary today. Temporary by design. Handlers port to Azure Functions v4 with cosmetic changes.

- Windows Service or Docker.
- TypeScript handlers via `defineAction({ name, description, handler })`.
- External triggers (Task Scheduler / cron / webhooks) or internal cron.
- Header token + rotatable API key. Per-action auth (anonymous / key / proxy).
- Streaming NDJSON for long-running syncs.
- Native TypeScript stripping. No build step.
- MIT.

## Hello action

```ts
// src/actions/hello.ts
import { defineAction } from "../runtime/registry.ts";

defineAction({
    name: "hello",
    description: "Smallest possible action.",
    handler: () => ({ greeting: "hi" }),
});
```

```ts
// src/actions/index.ts
import "./hello.ts";
```

```bash
curl http://localhost:3000/action/hello
# {"action":"hello","result":{"greeting":"hi"}}
```

## When you'd reach for this

- **ERP → CRM sync.** SQL/OData read, push summary to HubSpot/Salesforce.
- **DB → website cache.** Internal DB → JSON blob → cache-clear endpoint.
- **Inbound webhook.** Receive SaaS webhook, verify HMAC, project into SharePoint / DB.
- **AD → SaaS provisioning.** Read groups via LDAP, mirror to Okta/Entra.
- **SFTP file drop.** Poll, transform, upload to Blob.
- **Internal notification fan-out.** App alert → Teams/Slack/email/PagerDuty.

Recipes for the first three live in `src/actions/examples/`.

## When you'd not reach for this

- You can use real Azure Functions (cloud data, Entra identity, no firewall blockers).
- You need autoscaling beyond a single Windows box / container.
- You're sustained above ~10 req/s.

## Comparison

|                                | az-functions-onprem | Azure Functions          | Logic Apps / Power Automate | Express + cron |
| ------------------------------ | ------------------- | ------------------------ | --------------------------- | -------------- |
| Runs behind firewall           | yes                 | Premium + VNet only      | no                          | yes            |
| Code-first authoring           | TypeScript          | TypeScript / C# / Python | designer / low-code         | any            |
| Built-in scheduler             | yes                 | yes                      | yes                         | no             |
| Webhook receivers              | yes                 | yes                      | yes                         | yes            |
| OpenAPI auto-generated         | yes                 | no                       | no                          | no             |
| Operates fully offline         | yes                 | no                       | no                          | yes            |
| Per-invocation cost            | $0                  | metered                  | metered                     | $0             |
| Migration to Azure Functions   | trivial             | n/a                      | rewrite                     | rewrite        |

## Migrating to Azure Functions

```ts
// Here:
defineAction({
    name: "syncCustomers",
    method: "POST",
    auth: "key",
    handler: async (ctx) => {
        ctx.log("starting sync");
        return httpResponse({ status: 201, jsonBody: { count: 42 } });
    },
});

// There (Azure Functions v4):
app.http("syncCustomers", {
    methods: ["POST"],
    authLevel: "function",
    handler: async (request, context) => {
        context.log("starting sync");
        return { status: 201, jsonBody: { count: 42 } };
    },
});
```

`ctx.log` (with `.info`/`.warn`/`.error`), `ctx.invocationId`, and `httpResponse({...})` mirror the Functions v4 context. Cron schedules use 6-field NCRONTAB and port to Timer triggers as-is. The scheduler, OpenAPI generator, auth middleware, Windows-service install, and UI are not used in Functions; the handler bodies are.

## Requirements

- Node.js 23.6 or newer (native TypeScript stripping).
- npm.
- Optional: Docker, Windows Server.

## Quickstart

```bash
npm install
npm run configure   # writes local.settings.json with random tokens, SERVICE_TYPE=dev
npm run dev         # node --watch on src/server.ts
```

Open `http://localhost:3000/`. Loopback auth is bypassed in `dev` mode. API docs at `/docs` (Swagger UI over `/openapi.json`).

`npm run check` before committing.

## Source layout

```
src/
├── runtime/      framework. Don't touch.
├── actions/      your actions (see src/actions/README.md)
│   └── examples/ copy-paste recipes, inert by default
├── helpers/      your shared helpers
├── config/       Windows service definition
├── views/        EJS UI
├── public/       static assets
└── server.ts     entrypoint
```

## Authoring actions

```ts
// src/actions/sync-customers.ts
import { defineAction } from "../runtime/registry.ts";

defineAction({
    name: "syncCustomers",
    description: "Pull customers from CRM, write to blob.",
    schedule: "0 */15 * * * *",   // optional internal cron (6-field NCRONTAB)
    method: "GET",                // GET (default) or POST
    timeoutMs: 60_000,
    auth: "key",                  // anonymous | key (default) | proxy
    handler: async (ctx) => {
        ctx.log("starting");
        return { count: 42 };
    },
    onSuccess: async (result, ctx) => {
        // optional post-success hook, e.g. ping a cache-clear endpoint
    },
});
```

An action is one of:

- `handler` — one-shot async function returning JSON.
- `steps: ["a", "b"]` — sequence of other registered actions, streamed as NDJSON step events.
- `stream` — async generator yielding NDJSON chunks.

Drop the file in `src/actions/`, add `import "./sync-customers.ts";` to `src/actions/index.ts`. The HTTP route, scheduler, OpenAPI entry, and index-page card are wired automatically.

POST actions reading the body:

```ts
import { defineAction, httpCtx } from "../runtime/registry.ts";

defineAction({
    name: "receive",
    description: "Accept a JSON POST.",
    method: "POST",
    handler: async (ctx) => {
        const { req } = httpCtx(ctx);
        const payload = req.body;
        return { received: true };
    },
});
```

## Triggering

**External**: Windows Task Scheduler / cron / Azure App Proxy webhooks hit `/action/:name`.

```pwsh
Invoke-WebRequest -Headers @{token='<AZURE_CUSTOM_HEADER_TOKEN>'} `
    http://localhost:3000/action/syncCustomers
```

Prefer header auth so the key doesn't end up in URL history or access logs. Query-string `?apiKey=<...>` works for quick local testing.

**Internal**: set `schedule` on the action; `node-cron` registers it at boot. Stream actions can't be scheduled internally. Both 5-field standard cron and 6-field NCRONTAB are accepted; the 6-field form ports straight to Azure Functions Timer triggers.

Azure App Proxy: configure it to add the `token` header on every proxied request. The auth middleware validates the header and logs the `upn` claim when present.

## Common on-prem integration packages

Not bundled. Install on demand:

- **`mssql`** — SQL Server (Dynamics GP, Business Central via TDS, internal warehouses). See `src/actions/examples/mssql-to-blob.ts`.
- **`@azure/msal-node`** — Entra app auth for Microsoft Graph, SharePoint, Dataverse, Power Platform. See `src/actions/examples/sharepoint-list-sync.ts`.
- **`@azure/storage-blob`** — already included; used by `src/helpers/sample-upload-blob.ts`.
- **`ldapjs`** / **`activedirectory2`** — direct Active Directory queries.
- **`nodemailer`** — SMTP relay via Exchange / O365.
- **`ssh2-sftp-client`** — SFTP drops for legacy partners.
- **`pino`** — structured JSON logging.

## Configuration

`local.settings.json` (gitignored):

```json
{
    "$schema": "./local.settings.schema.json",
    "Values": {
        "AZURE_CUSTOM_HEADER_TOKEN": "replace-with-rotatable-header-token",
        "SERVICE_TYPE": "dev",
        "WEB_INTEGRATIONS_API_KEY": "replace-with-rotatable-api-key",
        "WEBSITE_BLOB_SAS": "https://example.blob.core.windows.net/container?sv=placeholder",
        "PORT": 3000,
        "CORS_ORIGINS": ""
    }
}
```

`CORS_ORIGINS` is a comma-separated allowlist; blank disables CORS.

For Docker / hosted deployments, provide the same keys as environment variables.

**Do not commit** `local.settings.json` or bake secrets into the image.

## Deployment

### Docker

```bash
docker build -t az-functions-onprem .
docker run --env-file .env -p 3000:3000 az-functions-onprem
```

- `NODE_ENV=production`, non-root `node` user.
- `npm ci --omit=dev`.
- `/healthz` for container health checks.
- `local.settings.json` and `.env` are not copied in.

### Windows Service

`npm run windows-install` / `npm run windows-uninstall` register the service via `node-windows`. Configure the service account in `services.msc`; logs go to the Application event log.

## About

A [Clear Path Research](https://clearpath.cloud) template.

## Version History

### v2 (2026-05)

- Renamed `az-functions-onprem`. Positioned as a migration-bridge runtime.
- `defineAction` registry with handler, sequence, and streaming (NDJSON) forms.
- Per-action `schedule` (cron), `timeoutMs`, `onSuccess`, `method` (GET/POST), `auth` level.
- `ctx.log` / `ctx.invocationId` / `httpResponse(...)` match Azure Functions v4 surface.
- `src/actions/examples/` recipes for SQL-to-blob, inbound webhook (HMAC), SharePoint via Graph.
- Source tree split: `src/runtime/` (framework) vs `src/actions/` / `src/helpers/` (user code).
- Internal `node-cron` scheduler; external Task Scheduler / cron still works.
- `/openapi.json` and `/docs` (Swagger UI) auto-generated from the registry.
- `CORS_ORIGINS` allowlist.
- UI: per-card inline output panels stream progress in place; no modal.
- Native Node TypeScript stripping replaces `nodemon` / `ts-node`.
- Hardened security defaults, refreshed dependencies.

### v1 (2023-11)

- Initial template: Express service, Windows-service install path, Docker packaging, shared header / API-key gating.
