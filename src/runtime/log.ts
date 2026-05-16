type EventLog = { info(message: string): void; warn(message: string): void; error(message: string): void };

let winLog: EventLog | null = null;

/** Wire the Windows Application Event Log writer. Called once from server.ts after settings validation, only when FN_SERVICE_TYPE === "windows". */
export function setEventLogger(logger: EventLog | null): void {
    winLog = logger;
}

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export function log(message: string, level: LogLevel = "info") {
    if (level === "trace") {
        console.trace(message);
        winLog?.info(message);
    } else if (level === "debug") {
        console.debug(message);
        winLog?.info(message);
    } else if (level === "info") {
        console.info(message);
        winLog?.info(message);
    } else if (level === "warn") {
        console.log(message);
        winLog?.warn(message);
    } else {
        console.error(message);
        winLog?.error(message);
    }
}

export function report(error: Error) {
    console.error(error);
    winLog?.error(error.message);
}
