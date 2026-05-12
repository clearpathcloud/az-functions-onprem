import cron from "node-cron";
import { getAction, getActions, runAction, makeActionLogger, type ActionDefinition, type InvocationContext } from "./registry.ts";
import { log } from "./log.ts";

function containsStream(action: ActionDefinition, seen: Set<string> = new Set()): boolean {
    if (seen.has(action.name)) return false;
    seen.add(action.name);
    if ("stream" in action) return true;
    if ("steps" in action) {
        for (const stepName of action.steps) {
            const step = getAction(stepName);
            if (step && containsStream(step, seen)) return true;
        }
    }
    return false;
}

async function runHandlerOrSequenceFromScheduler(action: ActionDefinition, context: InvocationContext): Promise<void> {
    if ("stream" in action) {
        throw new Error(`Streaming action "${action.name}" cannot be invoked from the scheduler.`);
    }
    if ("handler" in action) {
        await runAction(action, undefined, context);
        return;
    }
    // Sequence: walk steps in order, logging per step.
    for (const stepName of action.steps) {
        const step = getAction(stepName);
        if (!step) throw new Error(`Step "${stepName}" referenced by "${action.name}" is not registered.`);
        log(`${context.invocationId} scheduler: running step "${stepName}"`);
        await runHandlerOrSequenceFromScheduler(step, context);
        log(`${context.invocationId} scheduler: step "${stepName}" done`);
    }
    if (action.onSuccess) await action.onSuccess(undefined, undefined, context);
}

export function registerSchedules(): void {
    for (const action of getActions()) {
        if (typeof action.schedule !== "string" || action.schedule.length === 0) continue;

        if (containsStream(action)) {
            log(`scheduler: skipping "${action.name}" - streaming actions are HTTP-only.`, "warn");
            continue;
        }

        if (!cron.validate(action.schedule)) {
            log(`scheduler: invalid cron expression "${action.schedule}" for "${action.name}"; skipping.`, "warn");
            continue;
        }

        cron.schedule(action.schedule, async () => {
            const invocationId = crypto.randomUUID();
            const context: InvocationContext = {
                trigger: "schedule",
                invocationId,
                log: makeActionLogger(invocationId),
            };
            log(`${invocationId} scheduler: running "${action.name}"`);
            try {
                await runHandlerOrSequenceFromScheduler(action, context);
                log(`${invocationId} scheduler: "${action.name}" finished`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                log(`${invocationId} scheduler: "${action.name}" failed: ${message}`, "warn");
            }
        });

        log(`scheduler: registered "${action.name}" with cron "${action.schedule}"`);
    }
}
