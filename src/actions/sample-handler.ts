import { defineAction } from "../runtime/registry.ts";

defineAction({
    name: "sampleHandler",
    description: "Basic handler. Echoes request id and timestamp.",
    handler: (_request, { invocationId }) => ({
        invocationId,
        timestamp: new Date().toISOString(),
        message: "Replace this with your own logic.",
    }),
});
