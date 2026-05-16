// === Observability hook ===
// To enable APM (New Relic, OpenTelemetry, Datadog, etc.), import your tracer
// here as the very first line so it patches modules before they load:
//     import "./observability.ts";
// ==========================

import express from "express";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import { createRequire } from "module";
import getSettings, { validateRuntimeSettings } from "./runtime/settings.ts";
import { log, setEventLogger } from "./runtime/log.ts";
import { auth } from "./runtime/auth.ts";
import {
    ConcurrencyLimitError,
    getAction,
    getActions,
    getLastRun,
    isHttpResponseInit,
    makeActionLogger,
    methodsOf,
    runAction,
    runStreamingAction,
    validateActionGraph,
    type HttpMethod,
    type HttpResponseInit,
    type InvocationContext,
} from "./runtime/registry.ts";
import { registerSchedules, stopSchedules } from "./runtime/scheduler.ts";
import { buildOpenApiSpec } from "./runtime/openapi.ts";
import "./actions/index.ts";

validateRuntimeSettings();

if (getSettings("FN_SERVICE_TYPE") === "windows") {
    const { serviceDefinition } = await import("./config/windows-service.ts");
    const { EventLogger } = createRequire(import.meta.url)("node-windows") as typeof import("node-windows");
    setEventLogger(new EventLogger({ source: serviceDefinition.name }));
}

const packageJson = createRequire(import.meta.url)("../package.json") as { name: string; version: string };

export const app: express.Express = express();

app.disable("x-powered-by");
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                "script-src": ["'self'"],
                "style-src": ["'self'", "'unsafe-inline'"],
                "font-src": ["'self'", "data:"],
                "worker-src": ["'self'", "blob:"],
            },
        },
    }),
);

const corsOriginsRaw = getSettings("FN_CORS_ORIGINS", "") ?? "";
const corsOrigins = corsOriginsRaw.split(",").map((o) => o.trim()).filter((o) => o.length > 0);
if (corsOrigins.includes("*")) {
    throw new Error('FN_CORS_ORIGINS cannot contain "*"; list each allowed origin explicitly.');
}
if (corsOrigins.length > 0) {
    app.use(cors({ origin: corsOrigins, credentials: false }));
    log(`cors: allowed origins ${corsOrigins.join(", ")}`);
}

const rateLimitPerMinute = Number(getSettings("FN_RATE_LIMIT_PER_MINUTE", 120) ?? 120);
if (rateLimitPerMinute > 0) {
    app.use(
        rateLimit({
            windowMs: 60_000,
            limit: rateLimitPerMinute,
            skip: (req) => req.path === "/healthz",
            standardHeaders: "draft-7",
            legacyHeaders: false,
            message: { error: "Too many requests" },
        }),
    );
    log(`rate-limit: ${rateLimitPerMinute} requests/minute per IP`);
}

function actionBodyErrorHandler(error: unknown, _req: Request, res: Response, next: NextFunction): void {
    if (!error) return next();
    const err = error as { message?: string; status?: number; statusCode?: number; type?: string };
    const status = err.status ?? err.statusCode ?? (err.type === "entity.too.large" ? 413 : 400);
    const requestId = String(res.getHeader("x-request-id") ?? "");
    const message = status === 413 ? "Request body too large" : "Invalid request body";
    log(`${requestId} ${message}: ${err.message ?? "parse failure"}`, "warn");
    res.status(status).json({ error: message, requestId });
}

function sendHttpResponse(res: Response, response: HttpResponseInit): void {
    if (response.headers) {
        for (const [key, value] of Object.entries(response.headers)) res.setHeader(key, value);
    }
    if (typeof response.status === "number") res.status(response.status);
    if (response.jsonBody !== undefined) {
        res.json(response.jsonBody);
    } else if (response.body !== undefined) {
        res.send(response.body);
    } else {
        res.end();
    }
}

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

app.use("/action", express.json({ limit: "1mb" }));
app.use("/action", express.urlencoded({ extended: false, limit: "1mb" }));
app.use("/action", actionBodyErrorHandler);

// static content
app.set("views", path.join(import.meta.dirname, "views"));
app.set("view engine", "ejs");

// express pages / routes / controllers go here
app.get("/", (req: Request, res: Response) => res.render("index", { actions: getActions(), getLastRun }));

app.get("/openapi.json", (req: Request, res: Response) =>
    res.json(buildOpenApiSpec({ title: packageJson.name, version: packageJson.version })),
);

app.get("/docs", (req: Request, res: Response) => res.render("docs"));

app.all("/action/:name", async (req: Request, res: Response) => {
    const nameParam = req.params.name;
    const name = typeof nameParam === "string" ? nameParam : "";
    const action = name ? getAction(name) : undefined;
    if (!action) {
        res.status(404).json({ error: "Action not found", name });
        return;
    }
    const allowed = methodsOf(action);
    if (!allowed.includes(req.method as HttpMethod)) {
        res.status(405).set("Allow", allowed.join(", ")).json({ error: `Action "${action.name}" expects ${allowed.join(" or ")}, got ${req.method}.` });
        return;
    }
    const invocationId = String(res.getHeader("x-request-id") ?? "");
    const context: InvocationContext = {
        trigger: "http",
        invocationId,
        log: makeActionLogger(invocationId),
    };
    try {
        if ("handler" in action) {
            const result = await runAction(action, req, context);
            if (!res.headersSent) {
                if (isHttpResponseInit(result)) {
                    sendHttpResponse(res, result);
                } else {
                    res.json({ action: action.name, result });
                }
            }
        } else {
            await runStreamingAction(action, req, context, res);
        }
    } catch (error) {
        if (error instanceof ConcurrencyLimitError) {
            if (!res.headersSent) {
                res.status(429).set("Retry-After", "30").json({ error: error.message });
            }
            return;
        }
        // Log server-side; only the invocationId leaves the building.
        const message = error instanceof Error ? error.message : String(error);
        log(`${invocationId} action "${action.name}" failed: ${message}`, "warn");
        if (!res.headersSent) res.status(500).json({ action: action.name, error: "Action failed", invocationId });
    }
});

// start
validateActionGraph();
registerSchedules();

const port = getSettings("FN_PORT", 3000);
// Default to loopback so a `windows` or `dev` deployment behind App Proxy can't be reached directly
// from the LAN. Docker has to expose 0.0.0.0 to be reachable from outside the container.
const defaultBindHost = getSettings("FN_SERVICE_TYPE") === "docker" ? "0.0.0.0" : "127.0.0.1";
const bindHost = (getSettings("FN_BIND_HOST", "") ?? "").trim() || defaultBindHost;
const server = app.listen(Number(port), bindHost, () => {
    log(`Running at http://${bindHost}:${port}/`);
});

function shutdown(signal: NodeJS.Signals) {
    log(`${signal} received. Shutting down.`);
    stopSchedules();

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
