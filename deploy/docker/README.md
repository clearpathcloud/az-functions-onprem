# Docker + Github Deployment Instructions

1. Move the github-workflows-docker file to `/.github/workflows/docker.yml`, or change for your CI/CD env.
2. Ensure whatever container service you're using has access to your package registry.
3. Deploy using an .env file with variables that match the `local.settings.schema.json` (the `local.settings.json` package is not included in the image).

You may also wish to use the `npm run docker-package` function to create an image that is portable without a container registry.

In testing, you can just use standard docker commands with the existing docker file, to build and run the project.

Ensure that files are secured, and consider using better secrets management. This template is meant as a starting point / POC for a project. I would also caution against the long term use of nodemon in prod. As this tool grows, consider adding a build step, expanding shared utils, and adding more security measures. Be careful to always use a least privileges approach when working on integrations.
