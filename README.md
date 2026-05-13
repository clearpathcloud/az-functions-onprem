# az-functions-onprem

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2023.6-339933)](https://nodejs.org)

Azure-Functions-style integrations runtime for Windows Server or Docker, behind your firewall. Native TypeScript stripping, no build step.

Handlers port to Azure Functions v4 with cosmetic changes.

Released as-is under MIT. No support, no roadmap, no warranty. Fork freely.

## Good reasons to use this

Useful for prototyping an Azure Function that must run on-prem before a cloud deployment is ready.

Typical jobs:

- **Sync On-site ERP → Cloud CRM.** SQL/OData read, push summary to HubSpot/Salesforce.
- **Sync On-site DB → SFTP or Web Hosting.** Poll, transform, upload.
- **Inbound webhook → Local DB.** Receive SaaS webhook, verify HMAC, project into DB.
- **Scheduled internal report.** Pull from DB, write to file share or email.
- **Browser-callable internal API (advanced).** Internal API for SPFx / Power Apps / custom UI behind Azure App Proxy; see Security and Browser-callable deployments below before using this path. For high traffic, sync to a SharePoint list/file or cache rather than calling through on every page view.
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
| No cloud runtime dependency  | yes                 | no                  | no                          | yes            |
| Migration to Azure Functions | easy                | n/a                 | rewrite                     | rewrite        |


## Requirements

- Node.js 23.6 or newer (native TypeScript stripping). npm.
- Either a Docker or a Windows Server host.

## Quickstart

```bash
npm install
npm run configure   # writes local.settings.json in dev mode.
npm run dev         # node --watch on src/server.ts
```

`http://localhost:3000/` for the UI, `/docs` for Swagger. Loopback bypasses auth in `dev` mode. `npm run typecheck` before committing.

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


## Authoring actions

```text
src/
├── runtime/      framework. Don't touch.
├── actions/      <-- your actions
│   └── examples/ copy-paste recipes, inert by default
├── helpers/      your shared helpers
├── config/       Windows service definition
├── views/        EJS UI
├── public/       static assets
└── server.ts     entrypoint
```
Put action files in `src/actions/`, then import them from `src/actions/index.ts`.

Routes, scheduler, OpenAPI, and the index card wire up automatically.

See the [action authoring guide](src/actions/README.md) for action forms, options, and examples.

## Triggering

Triggering actions is done with an HTTP `GET` or HTTP `POST` to `/action/{actionName}`.


```pwsh
# powershell
Invoke-WebRequest -Headers @{token='<TOKEN>'} http://localhost:3000/action/syncCustomers

# bash (linux)
curl 'http://localhost:3000/action/syncCustomers?apiKey=<KEY>'
```

Authenticated is provided by the header token or the api key. Those values are set the configuration.

You can trigger from the UI, from a Windows Scheduled Task (e.g. using Invoke-WebRequest on a Powershell file), or from the built-in scheduler.

To use the internal scheduler: set `schedule` on an action. This uses the 6 field NCRONTAB Timer syntax that Azure Functions uses. Use `concurrency: 1` for scheduled mutations unless overlap is safe.

When using Azure App Proxy, configure it to inject the `token` header on every proxied request. The caller never sees the token. Middleware logs the `upn` claim.

## Security

This is a template. The auth model is rudimentary and has not been audited. Each deployment needs security considered, and each will have unique security requirements. Before deploying anywhere with sensitive data, customer access, or anything you wouldn't want compromised, have someone qualified review the auth flow, network exposure, logging, secret handling, and dependencies. No warranty is provided, see LICENSE.

### Browser-callable deployments (advanced)

You can expose the service to browsers (SPFx, Power Apps, custom UIs), but this does widens the security concerns.

Azure App Proxy with `authLevel: "header"` (default) and `FN_CORS_ORIGINS` set to each tenant origin. Direct AAD JWT validation (`aadHttpClientFactory`) is not built in; you will need to add your own.

## Deployment

Both deployment paths expose `/healthz`.

### Configuration

Use `local.settings.json` at the project root (gitignored). It mirrors Azure Functions local settings and is easier for Windows admins than env vars. The `$schema` reference gives VS Code autocomplete + validation; extra keys for your own helpers are accepted.

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

### Runtime choices

**Windows service** ends up as a named service in `services.msc`, running `src/server.ts` from this folder under a configured Windows account, with logs in the Application event log. Choose this for the normal single-server on-prem install, especially when the operator expects Windows Services, Event Viewer, local file shares, Windows certificates, or other Windows-hosted resources. See [Windows service deployment](deploy/windows/README.md).

**Docker** ends up as a container image running the app as non-root `node`, configured by env vars or an `.env` file instead of `local.settings.json`. Choose this when the target environment already runs containers, you want image-based promotion between environments, or you need to ship a portable tarball with `npm run docker-package`. See [Docker deployment](deploy/docker/README.md).

## Azure Functions migration

Action signatures intentionally stay close to Azure Functions v4. See the [Azure Functions migration notes](MIGRATION.md) for the porting example and official Microsoft docs.

## About

A [Clear Path Research](https://clearpath.cloud) template.

## Version History

- **v2 (2026-05)** — Renamed, repositioned as Azure-Functions-style migration bridge. `defineAction` registry, auto-wired routes / scheduler / OpenAPI. Hardened defaults.
- **v1 (2023-11)** — Initial Express + Windows-service template.
