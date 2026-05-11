# Web Integrations Template

- This project contains a Windows Web Service or Docker Container designed for internal rapid development using node + typescript.
- It is designed for small, simple, low-risk projects.
- It includes starter request gating with rotatable keys.
- It can sit behind Azure App Proxy or another enterprise access layer.
- It was originally designed to facilitate an [Azure Integration Services](https://azure.microsoft.com/en-us/products/category/integration) pattern.
- It is distributed under the MIT license.
 
## Requirements

- Node.js `23.6.0` or newer. This project uses native Node TypeScript stripping.
- npm for package management.
- Docker is optional for container deployment.
- Windows Server is optional for Windows service deployment.

## Runtime Model

- Source files run directly with `node`; there is no build step and no `ts-node`.
- TypeScript must stay compatible with native Node type stripping. `erasableSyntaxOnly` is enabled in `tsconfig.json` to catch unsupported syntax.
- Use `npm run dev` for local watched restarts and `npm start` for production-style startup.
- Run `npm run check` before committing changes.

## How it works

The template includes simple request gating so unattended jobs and proxy-routed requests can call endpoints during early development. This is not a full authentication or authorization implementation.
Secrets and keys are defined in `local.settings.json` or environment variables. `local.settings.json` is read first, then environment variables are used as fallback.

- Windows Task Scheduler + Powershell can make requests to URLs on a schedule. During early development those can use a query string key, for example: `Invoke-WebRequest http://localhost:3000/action?apiKey=<WEB_INTEGRATIONS_API_KEY>`
- If you set up an Azure App Proxy Application, it can be configured to add headers. This template checks `token` against `AZURE_CUSTOM_HEADER_TOKEN` and logs `upn` when present, but it does not validate identity, groups, roles, or permissions.

Before production use, implement authentication and authorization appropriate to your environment. Common options include validating identity provider tokens, enforcing group or role membership, checking per-route permissions, and moving secrets to managed secret storage. Keep key rotation, least privilege, and production logging requirements explicit for each integration.

Azure App Proxy can be used as an enterprise access layer in front of this service. Configure it to require user sign-in and inject trusted headers only on proxied requests. This template can check a shared proxy token header, but production deployments should still validate identity and enforce authorization using groups, roles, or route-specific policy.

#### Warning: The `local.settings.json` or environment variables should not be committed to the repo or stored in the container. ####

## Configuration

Create `local.settings.json` in the project root for local development:

```json
{
    "$schema": "./local.settings.schema.json",
    "Values": {
        "AZURE_CUSTOM_HEADER_TOKEN": "replace-with-rotatable-header-token",
        "SERVICE_TYPE": "dev",
        "WEB_INTEGRATIONS_API_KEY": "replace-with-rotatable-api-key",
        "WEBSITE_BLOB_SAS": "https://example.blob.core.windows.net/container?sv=placeholder",
        "PORT": 3000
    }
}
```

For Docker or hosted deployments, provide the same keys as environment variables instead of copying `local.settings.json` into the image.

## Local development: getting started

- Ensure Node.js `23.6.0` or newer is installed on your machine.
- cd to this directory
- `npm install`
- Create `local.settings.json` using the example above.
- Run `npm run dev`
- No compile step exists. Native Node TypeScript stripping runs the source directly, so use Node.js `23.6.0` or newer; nodemon restarts the local service every time you make a change.
- Run `npm run check` before committing changes.


## Deployment

Partial instructions in the relevant `deploy` folder. The Docker image exposes `/healthz` and runs with `NODE_ENV=production`.

## Docker

Build the image:

```bash
docker build -t web-integrations-template .
```

Run it with environment variables from a file:

```bash
docker run --env-file .env -p 3000:3000 web-integrations-template
```

Expected container behavior:

- Runs with `NODE_ENV=production`.
- Installs production dependencies only.
- Runs as the non-root `node` user.
- Exposes `/healthz` for container health checks.
- Does not copy `local.settings.json` or `.env` files into the image.

#### Security note: This template is a quick start template only. Review secrets, logging, restart policy, and access controls before going live. ####
