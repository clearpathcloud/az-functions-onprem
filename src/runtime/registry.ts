import type { Request } from "express";
import { log as runtimeLog, type LogLevel } from "./log.ts";

export interface ActionLogger {
    (message: string): void;
    trace(message: string): void;
    debug(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

/** Functions-style HttpResponseInit. Handlers may return this directly to control status/headers/body. */
export interface HttpResponseInit {
    status?: number;
    jsonBody?: unknown;
    body?: string | Buffer | Uint8Array;
    headers?: Record<string, string>;
}

/** Express Request, aliased so action signatures read like Functions v4. */
export type HttpRequest = Request;

/** Per-invocation context. Matches the corresponding field name in Functions v4. */
export interface InvocationContext {
    trigger: "http" | "schedule";
    invocationId: string;
    log: ActionLogger;
}

export function makeActionLogger(invocationId: string): ActionLogger {
    const at = (level: LogLevel) => (message: string) => runtimeLog(`${invocationId} ${message}`, level);
    const fn = at("info") as ActionLogger;
    fn.trace = at("trace");
    fn.debug = at("debug");
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

type Awaitable<T> = T | Promise<T>;
type Handler = (request: HttpRequest | undefined, context: InvocationContext) => Awaitable<unknown>;
type StreamHandler = (request: HttpRequest, context: InvocationContext) => AsyncGenerator<unknown, unknown, unknown>;
type SuccessHook = (result: unknown, request: HttpRequest | undefined, context: InvocationContext) => Awaitable<unknown>;

export type AuthLevel = "anonymous" | "key" | "header";
export type HttpMethod = "GET" | "POST";

interface BaseActionDefinition {
    name: string;
    description: string;
    onSuccess?: SuccessHook;
    timeoutMs?: number;
    /** Cron expression for the internal scheduler. Action remains HTTP-callable regardless. */
    schedule?: string;
    /** Override the global auth level for this action. Defaults to "header" (token in HTTP header). */
    authLevel?: AuthLevel;
    /** HTTP methods this action accepts. Defaults to ["GET", "POST"] (matches Functions v4). Handler reads `request.method` to discriminate. */
    methods?: HttpMethod[];
    /** Max concurrent in-flight invocations for this action. Excess calls are rejected with 429. */
    concurrency?: number;
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

export class ConcurrencyLimitError extends Error {
    action: string;
    limit: number;
    constructor(action: string, limit: number) {
        super(`Action "${action}" is at concurrency limit (${limit}).`);
        this.name = "ConcurrencyLimitError";
        this.action = action;
        this.limit = limit;
    }
}

export function defineAction(def: ActionDefinition): void {
    if (!/^[a-z][a-zA-Z0-9_-]*$/.test(def.name)) {
        throw new Error(`Action name "${def.name}" must start with a lowercase letter and contain only [a-zA-Z0-9_-].`);
    }
    const formCount = ("handler" in def ? 1 : 0) + ("steps" in def ? 1 : 0) + ("stream" in def ? 1 : 0);
    if (formCount !== 1) {
        throw new Error(`Action "${def.name}" must declare exactly one of handler, steps, or stream (got ${formCount}).`);
    }
    if (actions.has(def.name)) {
        throw new Error(`Action "${def.name}" is already defined.`);
    }
    actions.set(def.name, def);
}

/**
 * Walk the sequence graph: reject missing step references and cycles.
 * Call once at boot after all actions are registered.
 */
export function validateActionGraph(): void {
    for (const action of getActions()) {
        if (!("steps" in action)) continue;
        const seen = new Set<string>();
        const stack: string[] = [];
        const walk = (name: string): void => {
            if (stack.includes(name)) {
                throw new Error(`Sequence cycle detected: ${[...stack, name].join(" -> ")} (in "${action.name}")`);
            }
            if (seen.has(name)) return;
            const step = getAction(name);
            if (!step) {
                throw new Error(`Action "${action.name}" references unknown step "${name}".`);
            }
            stack.push(name);
            if ("steps" in step) {
                for (const child of step.steps) walk(child);
            }
            stack.pop();
            seen.add(name);
        };
        for (const stepName of action.steps) walk(stepName);
    }
}

export function getActions(): readonly ActionDefinition[] {
    return [...actions.values()];
}

export function getAction(name: string): ActionDefinition | undefined {
    return actions.get(name);
}

export function methodsOf(action: ActionDefinition): readonly HttpMethod[] {
    const m = action.methods;
    if (!m || m.length === 0) return ["GET", "POST"];
    return m;
}

const inFlight = new Map<string, number>();

/** Reserve a concurrency slot for an action. Returns false if the action is at its cap. */
export function tryAcquireSlot(action: ActionDefinition): boolean {
    if (!action.concurrency || action.concurrency <= 0) return true;
    const current = inFlight.get(action.name) ?? 0;
    if (current >= action.concurrency) return false;
    inFlight.set(action.name, current + 1);
    return true;
}

export function releaseSlot(action: ActionDefinition): void {
    if (!action.concurrency || action.concurrency <= 0) return;
    const current = inFlight.get(action.name) ?? 1;
    inFlight.set(action.name, Math.max(0, current - 1));
}

export interface LastRun {
    at: string;
    status: "ok" | "fail";
    durationMs: number;
}

const lastRunByAction = new Map<string, LastRun>();

export function getLastRun(name: string): LastRun | undefined {
    return lastRunByAction.get(name);
}

function recordRun(action: ActionDefinition, status: "ok" | "fail", start: number): void {
    lastRunByAction.set(action.name, {
        at: new Date().toISOString(),
        status,
        durationMs: Date.now() - start,
    });
}

/** Assert that an action was invoked with an HTTP request, narrowing the type. Throws when called from the scheduler. */
export function requireRequest(request: HttpRequest | undefined): HttpRequest {
    if (!request) {
        throw new Error("This action requires an HTTP request; it was invoked from the scheduler.");
    }
    return request;
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

/** Run a handler-only action and return its result. Acquires + releases the action's concurrency slot. */
export async function runAction(action: HandlerActionDefinition, request: HttpRequest | undefined, context: InvocationContext): Promise<unknown> {
    if (!tryAcquireSlot(action)) {
        throw new ConcurrencyLimitError(action.name, action.concurrency ?? 0);
    }
    const start = Date.now();
    try {
        const work = action.handler(request, context);
        const promise = work instanceof Promise ? work : Promise.resolve(work);
        const result = action.timeoutMs ? await withTimeout(promise, action.timeoutMs, action.name) : await promise;
        if (action.onSuccess) await action.onSuccess(result, request, context);
        recordRun(action, "ok", start);
        return result;
    } catch (error) {
        recordRun(action, "fail", start);
        throw error;
    } finally {
        releaseSlot(action);
    }
}

/** Async generator that yields whatever a stream or sequence action emits. Stream actions are HTTP-only; the scheduler refuses them at boot. */
export async function* streamOf(
    action: StreamActionDefinition | SequenceActionDefinition,
    request: HttpRequest,
    context: InvocationContext,
): AsyncGenerator<unknown> {
    if (!tryAcquireSlot(action)) {
        throw new ConcurrencyLimitError(action.name, action.concurrency ?? 0);
    }
    const start = Date.now();
    let status: "ok" | "fail" = "ok";
    try {
        if ("stream" in action) {
            const iter = action.stream(request, context);
            try {
                while (true) {
                    const nextStep = iter.next();
                    const step = action.timeoutMs
                        ? await withTimeout(nextStep, action.timeoutMs, `${action.name} (idle between yields)`)
                        : await nextStep;
                    if (step.done) {
                        if (action.onSuccess) await action.onSuccess(step.value, request, context);
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
                    status = "fail";
                    yield { step: stepName, status: "failed", error: `"${stepName}" is not registered`, at: new Date().toISOString() };
                    return;
                }
                yield { step: stepName, status: "started", at: new Date().toISOString() };
                try {
                    if ("stream" in step || "steps" in step) {
                        for await (const chunk of streamOf(step, request, context)) {
                            yield { step: stepName, status: "progress", chunk };
                        }
                        yield { step: stepName, status: "done", at: new Date().toISOString() };
                    } else {
                        const result = await runAction(step, request, context);
                        yield { step: stepName, status: "done", result, at: new Date().toISOString() };
                    }
                } catch (error) {
                    status = "fail";
                    const message = error instanceof Error ? error.message : String(error);
                    yield { step: stepName, status: "failed", error: message, at: new Date().toISOString() };
                    return;
                }
            }
            if (action.onSuccess) await action.onSuccess(undefined, request, context);
        }
    } catch (error) {
        status = "fail";
        throw error;
    } finally {
        recordRun(action, status, start);
        releaseSlot(action);
    }
}

/** Write an action's stream to an HTTP response as NDJSON. */
export async function runStreamingAction(
    action: StreamActionDefinition | SequenceActionDefinition,
    request: HttpRequest,
    context: InvocationContext,
    res: import("express").Response,
): Promise<void> {
    const { invocationId } = context;
    let started = false;
    try {
        for await (const chunk of streamOf(action, request, context)) {
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
        runtimeLog(`${invocationId} action "${action.name}" stream failed: ${message}`, "error");
        if (!started && !res.headersSent) {
            res.status(500).json({ action: action.name, error: "Action failed", invocationId });
        } else {
            try {
                res.write(JSON.stringify({ error: "Action failed", invocationId }) + "\n");
            } catch {
                /* connection probably closed; ignore */
            }
            res.end();
        }
    }
}
