import { getActions, methodsOf, type ActionDefinition } from "./registry.ts";

type SecurityRequirement = Record<string, string[]>;

interface OpenApiOperation {
    summary: string;
    operationId: string;
    tags: string[];
    security: SecurityRequirement[];
    requestBody?: Record<string, unknown>;
    responses: Record<string, unknown>;
}

type OpenApiPath = Partial<Record<"get" | "post", OpenApiOperation>>;

function kindOf(action: ActionDefinition): "handler" | "sequence" | "stream" {
    if ("stream" in action) return "stream";
    if ("steps" in action) return "sequence";
    return "handler";
}

function securityFor(action: ActionDefinition): SecurityRequirement[] {
    const level = action.authLevel ?? "header";
    if (level === "anonymous") return [];
    if (level === "key") return [{ headerToken: [] }, { apiKeyQuery: [] }];
    return [{ headerToken: [] }];
}

function jsonContent(properties: Record<string, unknown>): Record<string, unknown> {
    return {
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties,
                },
            },
        },
    };
}

function jsonResponse(description: string, properties: Record<string, unknown>): Record<string, unknown> {
    return {
        description,
        ...jsonContent(properties),
    };
}

function ndjsonResponse(description: string, examples: Record<string, { value: string }>): Record<string, unknown> {
    return {
        description,
        content: {
            "application/x-ndjson": {
                schema: { type: "string" },
                examples,
            },
        },
    };
}

function responseSchemaFor(action: ActionDefinition): Record<string, unknown> {
    const kind = kindOf(action);
    if (kind === "handler") {
        return jsonResponse("Action completed. Handlers return this wrapper unless they return HttpResponseInit.", {
            action: { type: "string", example: action.name },
            result: { type: "object" },
        });
    }
    if (kind === "sequence") {
        return ndjsonResponse("Sequence stream. Each line is a step transition.", {
            started: { value: "{\"step\":\"sampleHandler\",\"status\":\"started\",\"at\":\"2026-05-13T00:00:00.000Z\"}\n" },
            done: { value: "{\"step\":\"sampleHandler\",\"status\":\"done\",\"result\":{\"ok\":true},\"at\":\"2026-05-13T00:00:01.000Z\"}\n" },
            failed: { value: "{\"step\":\"sampleHandler\",\"status\":\"failed\",\"error\":\"Action failed\",\"at\":\"2026-05-13T00:00:01.000Z\"}\n" },
        });
    }
    return ndjsonResponse("Streaming output. Each line is a yielded value from the generator.", {
        progress: { value: "{\"phase\":\"progress\",\"step\":1,\"of\":4}\n" },
    });
}

const errorJson = jsonContent({
    error: { type: "string" },
    requestId: { type: "string" },
    invocationId: { type: "string" },
});

export function buildOpenApiSpec(info: { title: string; version: string }) {
    const paths: Record<string, OpenApiPath> = {};

    paths["/healthz"] = {
        get: {
            summary: "Liveness probe. Always public.",
            operationId: "healthz",
            tags: ["meta"],
            security: [],
            responses: {
                "200": {
                    description: "ok",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: { status: { type: "string", example: "ok" } },
                            },
                        },
                    },
                },
            },
        },
    };

    for (const action of getActions()) {
        const kind = kindOf(action);
        const tags: string[] = [kind];
        if (action.schedule) tags.push("scheduled");
        const methods = methodsOf(action);
        const pathItem: OpenApiPath = {};
        for (const method of methods) {
            const opIdSuffix = methods.length > 1 ? `_${method.toLowerCase()}` : "";
            const operation: OpenApiOperation = {
                summary: action.description,
                operationId: `${action.name}${opIdSuffix}`,
                tags,
                security: securityFor(action),
                responses: {
                    "200": responseSchemaFor(action),
                    "401": { description: "Unauthorized", ...errorJson },
                    "404": jsonResponse("Action not found", { error: { type: "string" }, name: { type: "string" } }),
                    "405": { description: "Method not allowed" },
                    "429": {
                        description: "Too many requests. Returned by global rate limiting or per-action concurrency caps.",
                        headers: {
                            "Retry-After": {
                                schema: { type: "string" },
                                description: "Seconds to wait before retrying when known.",
                            },
                        },
                        ...errorJson,
                    },
                    "500": jsonResponse("Action failed", { action: { type: "string" }, error: { type: "string" } }),
                },
            };
            if (method === "POST") {
                operation.requestBody = {
                    required: false,
                    content: { "application/json": { schema: { type: "object" } } },
                };
            }
            pathItem[method.toLowerCase() as "get" | "post"] = operation;
        }
        paths[`/action/${action.name}`] = pathItem;
    }

    return {
        openapi: "3.0.3",
        info,
        servers: [{ url: "/" }],
        components: {
            securitySchemes: {
                headerToken: { type: "apiKey", in: "header", name: "token" },
                apiKeyQuery: { type: "apiKey", in: "query", name: "apiKey" },
            },
        },
        security: [{ headerToken: [] }],
        paths,
    };
}
