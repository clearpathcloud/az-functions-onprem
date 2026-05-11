import type { Request, Response, NextFunction } from "express";
import getSettings from "../utils/settings.ts";
import { log } from "../utils/log.ts";

const apiKey = getSettings("WEB_INTEGRATIONS_API_KEY");
const azureToken = getSettings("AZURE_CUSTOM_HEADER_TOKEN");

export function auth(req: Request, res: Response, next: NextFunction) {
    // Allow bypass for local machine in non-production environments
    if (process.env.NODE_ENV !== "production" && (req.ip === "127.0.0.1" || req.ip === "::1")) {
        return next();
    } else if (req.headers.token == azureToken) {
        log(`${req.headers.upn} accessed ${req.path} via proxy`);
        return next();
    } else if (req.query.apiKey === apiKey) {
        return next();
    } else {
        return res.status(401).send("Invalid API key or auth. Are you accessing the site via the proxy URL?");
    }
}
