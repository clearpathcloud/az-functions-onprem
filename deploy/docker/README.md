# Docker + Github Deployment Instructions

1. Move the optional `github-workflows-docker.yml` file to `/.github/workflows/docker.yml`, or change for your CI/CD env. The template ships with no CI workflows active.
2. Ensure whatever container service you're using has access to your package registry.
3. Deploy using an .env file with variables that match the `local.settings.schema.json` (the `local.settings.json` package is not included in the image).

You may also wish to use the `npm run docker-package` function to create `az-functions-onprem-docker-image.tar`, which is portable without a container registry.

In testing, you can just use standard docker commands with the existing Dockerfile, to build and run the project. The image uses `node:slim` for broader compatibility, runs as the non-root `node` user, sets `NODE_ENV=production`, installs only production dependencies, and exposes `/healthz` for container health checks.

Ensure files are secured and use proper secrets management. Apply a least-privilege approach to whatever the service connects to.
