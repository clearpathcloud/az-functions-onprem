# az-functions-onprem

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2023.6-339933)](https://nodejs.org)

Azure-Functions-style integrations runtime for Windows Server or Docker, behind your firewall. Native TypeScript stripping, no build step.

Handlers port to Azure Functions v4 with cosmetic changes.

Released as-is under MIT. No support, no roadmap, no warranty. Fork freely.

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

## Good reasons to use this

Mostly useful to prototype an Azure Function that will run on-prem until a cloud deployment is ready, with the intention to migrate to Azure later.

The sorts of functions that this might be used for:

- **Sync On-site ERP → Cloud CRM.** SQL/OData read, push summary to HubSpot/Salesforce.
- **Sync On-site DB → SFTP or Web Hosting.** Poll, transform, upload.
- **Inbound webhook → Local DB.** Receive SaaS webhook, verify HMAC, project into DB.
- **Scheduled internal report.** Pull from DB, write to file share or email.
- **On-site DB → SPFX (SharePoint) WebPart.** Internal API for SPFx / Power Apps / custom UI. For example, Custom LOB system feeds to intranet. (N.B. consider scaling! SP list/file sync would be appropriate for high traffic.)
- **On-site event → Cloud alert.** App alert → Teams/Slack/email/PagerDuty.

## When to avoid

- If you can use real Azure Functions (cloud data, Entra identity, no firewall blockers), do so.
- If you need autoscaling beyond a single Windows box / container, consider other options.
- If [Azure Local](https://azure.microsoft.com/en-us/products/local), [vendor alternatives](https://www.nutanix.com), or *just running a container* is preferable, please consider those options!
- If you'll hit above ~10 req/s, consider other options, or at least be sure to implement server-side caching.

## Comparison

|                              | this                | Azure Functions     | Logic Apps / Power Automate | Express + cron |
| ---------------------------- | ------------------- | ------------------- | --------------------------- | -------------- |
| Runs behind firewall         | yes                 | Premium + VNet      | no                          | yes            |
| Built-in scheduler           | yes                 | yes                 | yes                         | no             |
| OpenAPI auto-generated       | yes                 | no                  | no                          | no             |
| Operates fully offline       | yes                 | no                  | no                          | yes            |
| Migration to Azure Functions | easy                | n/a                 | rewrite                     | rewrite        |

## Migrating to Azure Functions

```ts
// Here:
defineAction({
    name: "syncCustomers",
    methods: ["POST"],
    handler: async (request, context) => {
        context.log("starting sync");
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

`context.log`, `context.invocationId`, and `httpResponse({...})` match Functions v4. Cron uses 6-field NCRONTAB; ports to Timer triggers as-is. Request body is sync (`request.body`, parsed by Express) - v4 is `await request.json()`, the one unavoidable migration delta.

## Requirements

Node.js 23.6 or newer (native TypeScript stripping). npm. Optional: Docker, Windows Server.

## Quickstart

```bash
npm install
npm run configure   # writes local.settings.json with random tokens, FN_SERVICE_TYPE=dev
npm run dev         # node --watch on src/server.ts
```

`http://localhost:3000/` for the UI, `/docs` for Swagger. Loopback bypasses auth in `dev` mode. `npm run check` before committing.

## Source layout

```text
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
    methods: ["GET"],             // omit to accept ["GET","POST"] (matches Functions v4)
    timeoutMs: 60_000,
    authLevel: "header",          // anonymous | key | header (default)
    concurrency: 1,               // optional in-flight cap; excess returns 429
    handler: async (request, context) => {
        context.log("starting");
        // POST body (sync, already parsed): request?.body
        // Scheduler invocations pass request: undefined - use requireRequest() to assert.
        return { count: 42 };
    },
    onSuccess: async (_result, _request, _context) => {
        // optional post-success hook, e.g. ping a cache-clear endpoint
    },
});
```

An action is one of:

- `handler` — one-shot async function returning JSON.
- `steps: ["a", "b"]` — sequence of other actions, streamed as NDJSON step events.
- `stream` — async generator yielding NDJSON chunks.

Add `import "./sync-customers.ts";` to `src/actions/index.ts`. Routes, scheduler, OpenAPI, and the index card wire up automatically.

## Triggering

Two secrets, two mechanisms:

- **`FN_AUTH_HEADER`** → value of the `token` HTTP header. Default `authLevel: "header"` actions accept only this.
- **`FN_AUTH_KEY`** → value of `?apiKey=...`. Only accepted on actions explicitly marked `authLevel: "key"`.

Prefer the header. Query strings leak into URL history, referer headers, and access logs.

```pwsh
# Header (works for default-protected actions and App Proxy):
Invoke-WebRequest -Headers @{token='<TOKEN>'} http://localhost:3000/action/syncCustomers

# Query (only on authLevel: "key" actions):
curl 'http://localhost:3000/action/syncCustomers?apiKey=<KEY>'
```

Internal scheduler: set `schedule` on the action. `node-cron` runs it at boot. Stream actions can't be scheduled internally.

Azure App Proxy: publish behind it; configure it to inject the `token` header on every proxied request. Caller never sees the token. Middleware logs the `upn` claim.

## Security

This is a template. The auth model is rudimentary and has not been audited. Before deploying anywhere with sensitive data, customer access, or anything you wouldn't want compromised, have someone qualified review the auth flow, network exposure, logging, secret handling, and dependencies. No warranty is provided, see LICENSE.

## Browser-callable deployments (advanced)

Exposing the service to browsers (SPFx, Power Apps, custom UIs) widens the threat model considerably.

Azure App Proxy with `authLevel: "header"` (default) and `FN_CORS_ORIGINS` set to each tenant origin. Direct AAD JWT validation (`aadHttpClientFactory`) is not built in; you will need to add your own.

## Common on-prem packages

Not bundled. Install on demand:

- **`mssql`** — SQL Server. See `src/actions/examples/mssql-to-blob.ts`.
- **`@azure/msal-node`** — Entra auth for Graph / SharePoint / Dataverse. See `src/actions/examples/sharepoint-list-sync.ts`.
- **`ldapjs`** — Active Directory queries.
- **`pino`** — structured JSON logging.

## Configuration

Primary mechanism is `local.settings.json` at the project root (gitignored). Mirrors the Azure Functions local-settings convention — a Windows admin edits a file rather than juggling env vars. The `$schema` reference gives VS Code autocomplete + validation; extra keys for your own helpers are accepted.

```json
{
    "$schema": "./local.settings.schema.json",
    "Values": {
        "FN_AUTH_HEADER": "replace-with-rotatable-header-token",
        "FN_SERVICE_TYPE": "dev",
        "FN_AUTH_KEY": "replace-with-rotatable-api-key",
        "FN_PORT": 3000,
        "FN_CORS_ORIGINS": ""
    }
}
```

| Key                        | Required | Default     | Purpose |
| -------------------------- | -------- | ----------- | ------- |
| `FN_SERVICE_TYPE`          | yes      | —           | Where this is running: `dev` (loopback-bypass on 127.0.0.1/::1), `windows` (Application Event Log), or `docker`. |
| `FN_AUTH_HEADER`           | yes      | —           | Secret accepted in the `token` HTTP header for default (`authLevel: "header"`) actions. Rotate by editing + restarting. |
| `FN_AUTH_KEY`              | yes      | —           | Fallback secret accepted as `?apiKey=...` only on actions explicitly marked `authLevel: "key"`. For callers that can't set headers. |
| `FN_PORT`                  | no       | `3000`      | TCP port the HTTP server binds to. |
| `FN_CORS_ORIGINS`          | no       | empty (off) | Comma-separated list of allowed origins. `*` throws at boot. |
| `FN_BIND_HOST`             | no       | `0.0.0.0`   | Interface to bind to. Set `127.0.0.1` behind a co-located proxy to refuse direct connections. |
| `FN_RATE_LIMIT_PER_MINUTE` | no       | `120`       | Per-IP rate cap across all routes (rolling 60s window). `0` disables. |

Schema descriptions match this table — VS Code shows them inline while you edit. Extra keys (your own helpers, libraries) are accepted; read them with `getSettings("YOUR_KEY")`.

Environment variables are a fallback only — `local.settings.json` wins when both are set. For Docker deployments where the file isn't practical, pass the same key names as env vars instead.

## Deployment

Both paths expose `/healthz`.

**Windows Service** — primary on-prem path. `npm run windows-install` / `npm run windows-uninstall` register the service via `node-windows`. Configure the service account in `services.msc`; logs go to the Application event log. Definition in `src/config/windows-service.ts`.

**Docker**:

```bash
docker build -t az-functions-onprem .
docker run --env-file .env -p 3000:3000 az-functions-onprem
```

Runs as non-root `node`, `NODE_ENV=production`, `npm ci --omit=dev`. Neither `local.settings.json` nor `.env` are copied in.

## About

A [Clear Path Research](https://clearpath.cloud) template.

## Version History

- **v2 (2026-05)** — Renamed, repositioned as Azure-Functions-style migration bridge. `defineAction` registry, auto-wired routes / scheduler / OpenAPI. Hardened defaults.
- **v1 (2023-11)** — Initial Express + Windows-service template.
