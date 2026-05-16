import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import getSettings from "./settings.ts";
import { log } from "./log.ts";
import { getAction, type AuthLevel } from "./registry.ts";

function safeEqual(a: unknown, b: string): boolean {
    if (typeof a !== "string" || a.length === 0 || b.length === 0) return false;
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
}

function isLoopback(req: Request): boolean {
    return getSettings("FN_SERVICE_TYPE") === "dev" && (req.ip === "127.0.0.1" || req.ip === "::1");
}

export function checkAuth(req: Request, level: AuthLevel): boolean {
    if (level === "anonymous") return true;
    if (isLoopback(req)) return true;
    if (safeEqual(req.headers.token, getSettings("FN_AUTH_HEADER"))) {
        const upn = typeof req.headers.upn === "string" && req.headers.upn.trim() ? req.headers.upn : "unknown user";
        log(`${upn} accessed ${req.path} via proxy`);
        return true;
    }
    if (level === "header") return false;
    return safeEqual(req.query.apiKey, getSettings("FN_AUTH_KEY"));
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
    return action?.authLevel;
}

export function auth(req: Request, res: Response, next: NextFunction) {
    // Default to "header" (token in HTTP header). Actions that need query-string apiKey access
    // must opt in with `authLevel: "key"`. Anonymous actions opt in explicitly.
    const level: AuthLevel = actionAuthLevelForPath(req.path) ?? "header";
    if (checkAuth(req, level)) return next();
    return res.status(401).json({ error: "Unauthorized" });
}
