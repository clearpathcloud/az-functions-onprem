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

function responseSchemaFor(action: ActionDefinition): Record<string, unknown> {
    const kind = kindOf(action);
    if (kind === "handler") {
        return {
            description: "Action completed.",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            action: { type: "string", example: action.name },
                            result: { type: "object" },
                        },
                    },
                },
            },
        };
    }
    if (kind === "sequence") {
        return {
            description: "Sequence stream. Each NDJSON line describes a step transition (started / progress / done / failed).",
            content: { "application/x-ndjson": { schema: { type: "string" } } },
        };
    }
    return {
        description: "Streaming output. Each NDJSON line is a yielded value from the generator.",
        content: { "application/x-ndjson": { schema: { type: "string" } } },
    };
}

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
        const summary = [action.description].filter(Boolean).join(" ");
        const tags: string[] = [kind];
        if (action.schedule) tags.push("scheduled");
        const methods = methodsOf(action);
        const pathItem: OpenApiPath = {};
        for (const method of methods) {
            const opIdSuffix = methods.length > 1 ? `_${method.toLowerCase()}` : "";
            const operation: OpenApiOperation = {
                summary,
                operationId: `${action.name}${opIdSuffix}`,
                tags,
                security: securityFor(action),
                responses: {
                    "200": responseSchemaFor(action),
                    "401": { description: "Unauthorized" },
                    "404": {
                        description: "Action not found",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: { error: { type: "string" }, name: { type: "string" } },
                                },
                            },
                        },
                    },
                    "405": { description: "Method not allowed" },
                    "500": {
                        description: "Action failed",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: { action: { type: "string" }, error: { type: "string" } },
                                },
                            },
                        },
                    },
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
