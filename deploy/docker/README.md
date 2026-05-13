# Docker + GitHub Deployment

1. Move the optional `github-workflows-docker.yml` file to `/.github/workflows/docker.yml`, or adapt it for your CI/CD environment. The template ships with no active workflows.
2. Ensure whatever container service you're using has access to your package registry.
3. Deploy with an `.env` file whose variables match `local.settings.schema.json`; `local.settings.json` is not copied into the image.

Use `npm run docker-package` to create `az-functions-onprem-docker-image.tar` for transfer without a container registry.

For local testing, standard Docker commands work with the existing Dockerfile. The image uses `node:slim`, runs as non-root `node`, sets `NODE_ENV=production`, installs production dependencies only, and exposes `/healthz`.

Protect `.env` and run downstream credentials with least privilege.
