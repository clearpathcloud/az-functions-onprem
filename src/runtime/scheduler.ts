import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { getActions, runAction, runSequenceAction, runStreamAction, makeActionLogger, type ActionDefinition, type InvocationContext } from "./registry.ts";
import { log } from "./log.ts";

const scheduledTasks: ScheduledTask[] = [];

async function runActionFromScheduler(action: ActionDefinition, context: InvocationContext): Promise<void> {
    if ("stream" in action) {
        await runStreamAction(action, undefined, context);
        return;
    }
    if ("handler" in action) {
        await runAction(action, undefined, context);
        return;
    }
    await runSequenceAction(action, undefined, context, (event) => {
        if (event.status === "started") log(`${context.invocationId} scheduler: running step "${event.step}"`);
        if (event.status === "done") log(`${context.invocationId} scheduler: step "${event.step}" done`);
        if (event.status === "failed") log(`${context.invocationId} scheduler: step "${event.step}" failed: ${event.error ?? "unknown error"}`, "warn");
    });
}

export function registerSchedules(): void {
    for (const action of getActions()) {
        if (typeof action.schedule !== "string" || action.schedule.length === 0) continue;

        if (!cron.validate(action.schedule)) {
            log(`scheduler: invalid cron expression "${action.schedule}" for "${action.name}"; skipping.`, "warn");
            continue;
        }

        const task = cron.schedule(action.schedule, async () => {
            const invocationId = crypto.randomUUID();
            const context: InvocationContext = {
                trigger: "schedule",
                invocationId,
                log: makeActionLogger(invocationId),
            };
            log(`${invocationId} scheduler: running "${action.name}"`);
            try {
                await runActionFromScheduler(action, context);
                log(`${invocationId} scheduler: "${action.name}" finished`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                log(`${invocationId} scheduler: "${action.name}" failed: ${message}`, "warn");
            }
        }, { name: action.name });
        scheduledTasks.push(task);

        log(`scheduler: registered "${action.name}" with cron "${action.schedule}"`);
    }
}

export function stopSchedules(): void {
    for (const task of scheduledTasks) task.stop();
}
