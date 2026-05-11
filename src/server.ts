import express from "express";
import type { Request, Response } from "express";
import helmet from "helmet";
import getSettings from "./utils/settings.ts";
import path from "path";
import { log } from "./utils/log.ts";
import { auth } from "./middleware/auth.ts";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
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

// static content
app.set("views", path.join(import.meta.dirname, "views"));
app.set("view engine", "ejs");

// express pages / routes / controllers go here
app.get("/", (req: Request, res: Response) => res.render("index"));

// start
const port = getSettings("PORT", 3000);
const server = app.listen(port, () => log(`Running at http://localhost:${port}/?apiKey=${getSettings("WEB_INTEGRATIONS_API_KEY")}`));

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
