import { defineAction } from "../runtime/registry.ts";
import { log } from "../runtime/log.ts";

defineAction({
    name: "samplePing",
    description: "Trivial second handler used by sampleSequence.",
    handler: () => ({ pong: true, at: Date.now() }),
});

defineAction({
    name: "sampleSequence",
    description: "Sequence: handler -> stream -> handler. Streaming step's yields appear as progress events.",
    steps: ["sampleHandler", "sampleStream", "samplePing"],
    onSuccess: async (_result, _request, context) => {
        log(`${context.invocationId} sampleSequence finished; this is where you would ping downstream.`);
    },
});
