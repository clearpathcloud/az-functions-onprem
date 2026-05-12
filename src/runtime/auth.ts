import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import getSettings from "./settings.ts";
import { log } from "./log.ts";
import { getAction } from "./registry.ts";

export type AuthLevel = "anonymous" | "key" | "proxy";

const apiKey = getSettings("WEB_INTEGRATIONS_API_KEY");
const azureToken = getSettings("AZURE_CUSTOM_HEADER_TOKEN");
const serviceType = getSettings("SERVICE_TYPE");

function safeEqual(a: unknown, b: string): boolean {
    if (typeof a !== "string" || a.length === 0 || b.length === 0) return false;
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
}

function isLoopback(req: Request): boolean {
    return serviceType === "dev" && (req.ip === "127.0.0.1" || req.ip === "::1");
}

export function checkAuth(req: Request, level: AuthLevel): boolean {
    if (level === "anonymous") return true;
    if (isLoopback(req)) return true;
    if (safeEqual(req.headers.token, azureToken)) {
        log(`${req.headers.upn} accessed ${req.path} via proxy`);
        return true;
    }
    if (level === "proxy") return false;
    return safeEqual(req.query.apiKey, apiKey);
}

function actionAuthLevelForPath(path: string): AuthLevel | undefined {
    if (!path.startsWith("/action/")) return undefined;
    const rest = path.slice("/action/".length).split("/")[0] ?? "";
    if (!rest) return undefined;
    let name: string;
    try {
        name = decodeURIComponent(rest);
    } catch {
        return undefined;
    }
    const action = getAction(name);
    return action?.auth;
}

export function auth(req: Request, res: Response, next: NextFunction) {
    const level: AuthLevel = actionAuthLevelForPath(req.path) ?? "key";
    if (checkAuth(req, level)) return next();
    return res.status(401).send("Unauthorized");
}
