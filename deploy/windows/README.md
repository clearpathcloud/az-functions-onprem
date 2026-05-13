# Windows Service Deployment

1. Place these files in a folder for execution.
2. Install Node.js from the Windows x64 MSI at https://nodejs.org/. Keep npm enabled and add Node.js to the system `PATH`.
3. Close and reopen PowerShell, then verify `node --version` and `npm --version` work. Node.js must be 23.6 or newer.
4. Install Visual Studio Code from https://code.visualstudio.com/ if you need an editor on the server. It is a lightweight option for editing this folder and can validate `local.settings.json` against `local.settings.schema.json`.
5. Run `npm ci`. This installs exactly what is in `package-lock.json`. If the server cannot reach the public npm registry, configure npm to use your internal package registry first.
6. Run `npm run configure`, choose `windows`, and verify the required `Values` in `local.settings.json`.
7. Edit `src/config/windows-service.ts` and choose a deployment-specific service name and description. The installer refuses the default `rename me` placeholder.
8. Run `npm run windows-install` from an elevated PowerShell to install the Windows service.
9. Configure the service in `services.msc`, setting the user.
10. Inspect `eventvwr.exe` Application Log for service events. Restart the service after config changes.

Install from the final folder location. The service points at `src/server.ts` in this tree, so moving the folder later means uninstalling and reinstalling the service.

After `npm run configure`, verify `local.settings.json`:

- `FN_SERVICE_TYPE` is `windows`, not `dev`.
- `FN_AUTH_HEADER` and `FN_AUTH_KEY` are set to generated or rotated secrets.
- `FN_BIND_HOST` is `127.0.0.1` if a co-located proxy is the only intended caller; otherwise leave the default and control access with Windows Firewall / network policy.
- `FN_CORS_ORIGINS` lists exact browser origins if SPFx / Power Apps / browser callers are used.

Use a least-privilege service account with access only to the databases, file shares, certificates, and proxies the actions need. Windows services do not reliably inherit mapped drives; use UNC paths for file shares.

Restart the service after editing `local.settings.json`, rotating secrets, changing action code, or changing schedules.

Common mistakes:

- Node.js must be 23.6 or newer because the service runs TypeScript directly with native type stripping.
- `local.settings.json` wins over environment variables. If a value looks ignored, check the file first.
- Keep `local.settings.json` private; it contains live secrets.
- Do not deploy with `FN_SERVICE_TYPE=dev`; loopback requests bypass auth in dev mode.
- Scheduled actions run in the server's local timezone. Use 6-field NCRONTAB for Azure Timer portability.
- For scheduled actions that mutate external systems, set `concurrency: 1` unless overlap is safe.
- If the service is exposed beyond localhost, verify firewall rules, App Proxy / reverse proxy behavior, CORS, and auth headers before adding real data.

Uninstall with:

```pwsh
npm run windows-uninstall
```
