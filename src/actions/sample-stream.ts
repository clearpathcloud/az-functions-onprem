import { defineAction } from "../runtime/registry.ts";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

defineAction({
    name: "sampleStream",
    description: "Streaming action. Yields five progress chunks with a delay between each.",
    timeoutMs: 5_000,
    stream: async function* ({ requestId }) {
        yield { phase: "starting", requestId };
        for (let i = 1; i <= 4; i++) {
            await sleep(400);
            yield { phase: "progress", step: i, of: 4 };
        }
        await sleep(200);
        yield { phase: "done", requestId };
        return { ok: true };
    },
});
