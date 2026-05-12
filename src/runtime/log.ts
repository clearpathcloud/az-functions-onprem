import { createRequire } from "module";
import getSettings from "./settings.ts";

const localRequire = createRequire(import.meta.url);
const windows = getSettings("SERVICE_TYPE") == "windows";
let winLog: any;

if (windows) {
    const { serviceDefinition } = await import("../config/windows-service.ts");
    const { EventLogger } = localRequire("node-windows");
    winLog = new EventLogger(serviceDefinition.name);
}

export function log(message: string, level: "info" | "warn" | "error" = "info") {
    if (level === "info") {
        console.info(message);
        if (windows) winLog.info(message);
    } else if (level === "warn") {
        console.log(message);
        if (windows) winLog.warn(message);
    } else {
        console.error(message);
        if (windows) winLog.error(message);
    }
}

export function report(error: Error) {
    console.error(error);
    if (windows) {
        winLog.error(error.message);
    }
}
