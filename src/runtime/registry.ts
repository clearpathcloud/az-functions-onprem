import type { Request, Response } from "express";
import { log as runtimeLog } from "./log.ts";

export type LogLevel = "info" | "warn" | "error";

export interface ActionLogger {
    (message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

/** Functions-style HttpResponseInit shape. Handlers may return this directly to control status/headers/body. */
export interface HttpResponseInit {
    status?: number;
    jsonBody?: unknown;
    body?: string | Buffer | unknown;
    headers?: Record<string, string>;
}

interface BaseContext {
    /** Per-invocation correlation id. */
    requestId: string;
    /** Alias for `requestId` that matches Azure Functions context API. */
    invocationId: string;
    /** Functions-style logger. Prefixes the requestId for you. `ctx.log("msg")` is info; `.warn` / `.error` for higher levels. */
    log: ActionLogger;
}

export function makeActionLogger(requestId: string): ActionLogger {
    const at = (level: LogLevel) => (message: string) => runtimeLog(`${requestId} ${message}`, level);
    const fn = at("info") as ActionLogger;
    fn.info = at("info");
    fn.warn = at("warn");
    fn.error = at("error");
    return fn;
}

/** Helper to mark a return value as an HttpResponseInit. Identity at runtime; documents intent. */
export function httpResponse(init: HttpResponseInit): HttpResponseInit {
    return init;
}

export function isHttpResponseInit(value: unknown): value is HttpResponseInit {
    if (!value || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    if ("jsonBody" in v) return true;
    if (typeof v.status === "number" && ("body" in v || "headers" in v)) return true;
    return false;
}

export interface HttpContext extends BaseContext {
    trigger: "http";
    req: Request;
    res: Response;
}

export interface ScheduleContext extends BaseContext {
    trigger: "schedule";
}

export type ActionContext = HttpContext | ScheduleContext;

type Awaitable<T> = T | Promise<T>;
type Handler = (ctx: ActionContext) => Awaitable<unknown>;
type StreamHandler = (ctx: ActionContext) => AsyncGenerator<unknown, unknown, unknown>;
type SuccessHook = (result: unknown, ctx: ActionContext) => Awaitable<unknown>;

export type AuthLevel = "anonymous" | "key" | "proxy";

interface BaseActionDefinition {
    name: string;
    description: string;
    onSuccess?: SuccessHook;
    timeoutMs?: number;
    /** Cron expression for the internal scheduler. Action remains HTTP-callable regardless. */
    schedule?: string;
    /** Override the global auth level for this action. Defaults to "key". */
    auth?: AuthLevel;
    /** HTTP method this action accepts. Defaults to "GET". Use "POST" for webhooks / actions that take a JSON body. */
    method?: "GET" | "POST";
}

export interface HandlerActionDefinition extends BaseActionDefinition {
    handler: Handler;
}

export interface SequenceActionDefinition extends BaseActionDefinition {
    steps: readonly string[];
}

export interface StreamActionDefinition extends BaseActionDefinition {
    stream: StreamHandler;
}

export type ActionDefinition = HandlerActionDefinition | SequenceActionDefinition | StreamActionDefinition;

const actions = new Map<string, ActionDefinition>();

export function defineAction(def: ActionDefinition): void {
    if (!/^[a-z][a-zA-Z0-9_-]*$/.test(def.name)) {
        throw new Error(`Action name "${def.name}" must start with a lowercase letter and contain only [a-zA-Z0-9_-].`);
    }
    if (actions.has(def.name)) {
        throw new Error(`Action "${def.name}" is already defined.`);
    }
    actions.set(def.name, def);
}

export function getActions(): readonly ActionDefinition[] {
    return [...actions.values()];
}

export function getAction(name: string): ActionDefinition | undefined {
    return actions.get(name);
}

/** Narrow an ActionContext to HttpContext, throwing if invoked from the scheduler. */
export function httpCtx(ctx: ActionContext): HttpContext {
    if (ctx.trigger !== "http") {
        throw new Error("This action requires HTTP context (req/res); it was invoked from the scheduler.");
    }
    return ctx;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/** Run a handler-only action and return its result. */
export async function runAction(action: HandlerActionDefinition, ctx: ActionContext): Promise<unknown> {
    const work = action.handler(ctx);
    const promise = work instanceof Promise ? work : Promise.resolve(work);
    const result = action.timeoutMs ? await withTimeout(promise, action.timeoutMs, action.name) : await promise;
    if (action.onSuccess) await action.onSuccess(result, ctx);
    return result;
}

/** Async generator that yields whatever a stream or sequence action emits. */
export async function* streamOf(
    action: StreamActionDefinition | SequenceActionDefinition,
    ctx: HttpContext,
): AsyncGenerator<unknown> {
    if ("stream" in action) {
        const iter = action.stream(ctx);
        try {
            while (true) {
                const nextStep = iter.next();
                const step = action.timeoutMs
                    ? await withTimeout(nextStep, action.timeoutMs, `${action.name} (idle between yields)`)
                    : await nextStep;
                if (step.done) {
                    if (action.onSuccess) await action.onSuccess(step.value, ctx);
                    return;
                }
                yield step.value;
            }
        } finally {
            try {
                await iter.return?.(undefined);
            } catch {
                /* ignore generator cleanup failures */
            }
        }
    } else {
        // Sequence: yield one event per step (started, done / failed / progress).
        for (const stepName of action.steps) {
            const step = getAction(stepName);
            if (!step) {
                yield { step: stepName, status: "failed", error: `"${stepName}" is not registered`, at: new Date().toISOString() };
                return;
            }
            yield { step: stepName, status: "started", at: new Date().toISOString() };
            try {
                if ("stream" in step || "steps" in step) {
                    for await (const chunk of streamOf(step, ctx)) {
                        yield { step: stepName, status: "progress", chunk };
                    }
                    yield { step: stepName, status: "done", at: new Date().toISOString() };
                } else {
                    const result = await runAction(step, ctx);
                    yield { step: stepName, status: "done", result, at: new Date().toISOString() };
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                yield { step: stepName, status: "failed", error: message, at: new Date().toISOString() };
                return;
            }
        }
        if (action.onSuccess) await action.onSuccess(undefined, ctx);
    }
}

/** Write an action's stream to an HTTP response as NDJSON. */
export async function runStreamingAction(
    action: StreamActionDefinition | SequenceActionDefinition,
    ctx: HttpContext,
): Promise<void> {
    const { res } = ctx;
    let started = false;
    try {
        for await (const chunk of streamOf(action, ctx)) {
            if (!started) {
                res.setHeader("Content-Type", "application/x-ndjson");
                res.setHeader("Cache-Control", "no-cache");
                res.setHeader("X-Accel-Buffering", "no");
                started = true;
            }
            res.write(JSON.stringify(chunk) + "\n");
        }
        if (!started) {
            res.setHeader("Content-Type", "application/x-ndjson");
        }
        res.end();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!started && !res.headersSent) {
            res.status(500).json({ action: action.name, error: message });
        } else {
            try {
                res.write(JSON.stringify({ error: message }) + "\n");
            } catch {
                /* connection probably closed; ignore */
            }
            res.end();
        }
    }
}
