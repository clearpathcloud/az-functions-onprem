// === Observability hook ===
// To enable APM (New Relic, OpenTelemetry, Datadog, etc.), import your tracer
// here as the very first line so it patches modules before they load:
//     import "./observability.ts";
// ==========================

import express from "express";
import type { Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import path from "path";
import { createRequire } from "module";
import getSettings from "./runtime/settings.ts";
import { log } from "./runtime/log.ts";
import { auth } from "./runtime/auth.ts";
import { getAction, getActions, runAction, runStreamingAction, makeActionLogger, isHttpResponseInit, type HttpResponseInit } from "./runtime/registry.ts";
import { registerSchedules } from "./runtime/scheduler.ts";
import { buildOpenApiSpec } from "./runtime/openapi.ts";
import "./actions/index.ts";

const packageJson = createRequire(import.meta.url)("../package.json") as { name: string; version: string };

export const app: express.Express = express();

app.disable("x-powered-by");
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                "script-src": ["'self'", "https://cdnjs.cloudflare.com"],
                "style-src": ["'self'", "https:", "'unsafe-inline'"],
                "font-src": ["'self'", "https:", "data:"],
                "worker-src": ["'self'", "blob:"],
            },
        },
    }),
);

const corsOriginsRaw = getSettings("CORS_ORIGINS", "") ?? "";
const corsOrigins = corsOriginsRaw.split(",").map((o) => o.trim()).filter((o) => o.length > 0);
if (corsOrigins.length > 0) {
    app.use(cors({ origin: corsOrigins, credentials: false }));
    log(`cors: allowed origins ${corsOrigins.join(", ")}`);
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    const requestId = req.get("x-request-id") ?? crypto.randomUUID();

    res.setHeader("x-request-id", requestId);
    res.on("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        log(`${requestId} ${req.method} ${req.path} ${res.statusCode} ${durationMs.toFixed(1)}ms`);
    });

    next();
});

app.get("/healthz", (req: Request, res: Response) => res.status(200).json({ status: "ok" }));

app.use(auth);

app.use(express.static(path.join(import.meta.dirname, "public")));

// static content
app.set("views", path.join(import.meta.dirname, "views"));
app.set("view engine", "ejs");

// express pages / routes / controllers go here
app.get("/", (req: Request, res: Response) => res.render("index", { actions: getActions() }));

app.get("/openapi.json", (req: Request, res: Response) =>
    res.json(buildOpenApiSpec({ title: packageJson.name, version: packageJson.version })),
);

app.get("/docs", (req: Request, res: Response) => res.render("docs"));

app.all("/action/:name", async (req: Request, res: Response) => {
    if (req.method !== "GET" && req.method !== "POST") {
        res.status(405).set("Allow", "GET, POST").json({ error: `Method ${req.method} not allowed` });
        return;
    }
    const nameParam = req.params.name;
    const name = typeof nameParam === "string" ? nameParam : "";
    const action = name ? getAction(name) : undefined;
    if (!action) {
        res.status(404).json({ error: "Action not found", name });
        return;
    }
    const expectedMethod = action.method ?? "GET";
    if (req.method !== expectedMethod) {
        res.status(405).set("Allow", expectedMethod).json({ error: `Action "${action.name}" expects ${expectedMethod}, got ${req.method}.` });
        return;
    }
    const requestId = String(res.getHeader("x-request-id") ?? "");
    const ctx = {
        trigger: "http" as const,
        req,
        res,
        requestId,
        invocationId: requestId,
        log: makeActionLogger(requestId),
    };
    try {
        if ("handler" in action) {
            const result = await runAction(action, ctx);
            if (!res.headersSent) {
                if (isHttpResponseInit(result)) {
                    const r = result as HttpResponseInit;
                    if (r.headers) for (const [k, v] of Object.entries(r.headers)) res.setHeader(k, v);
                    if (typeof r.status === "number") res.status(r.status);
                    if (r.jsonBody !== undefined) res.json(r.jsonBody);
                    else if (r.body !== undefined) res.send(r.body as string | Buffer);
                    else res.end();
                } else {
                    res.json({ action: action.name, result });
                }
            }
        } else {
            await runStreamingAction(action, ctx);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`${requestId} action "${action.name}" failed: ${message}`, "warn");
        if (!res.headersSent) res.status(500).json({ action: action.name, error: message });
    }
});

// start
const port = getSettings("PORT", 3000);
const server = app.listen(port, () => {
    log(`Running at http://localhost:${port}/`);
    registerSchedules();
});

function shutdown(signal: NodeJS.Signals) {
    log(`${signal} received. Shutting down.`);
    server.close((error) => {
        if (error) {
            console.error(error);
            process.exit(1);
        }

        process.exit(0);
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
