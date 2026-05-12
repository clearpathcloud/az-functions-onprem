import { defineAction } from "../runtime/registry.ts";

defineAction({
    name: "sampleHandler",
    description: "Basic handler. Echoes request id and timestamp. Cron set for visibility in the UI; runs daily at 04:00.",
    schedule: "0 0 4 * * *",
    handler: (_request, { invocationId }) => ({
        invocationId,
        timestamp: new Date().toISOString(),
        message: "Replace this with your own logic.",
    }),
});
