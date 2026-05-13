import { createRequire } from "module";

type ServiceType = "windows" | "docker" | "dev";

type SettingsValues = {
    FN_AUTH_HEADER: string;
    FN_SERVICE_TYPE: ServiceType;
    FN_AUTH_KEY: string;
    FN_PORT?: number | string;
    FN_CORS_ORIGINS?: string;
    /** Interface to bind to. Default 0.0.0.0 (all). Set to "127.0.0.1" for co-located proxy deployments to refuse direct connections. */
    FN_BIND_HOST?: string;
    /** Max requests per minute per IP across all routes. Default 120. Set to 0 to disable. */
    FN_RATE_LIMIT_PER_MINUTE?: number | string;
};

const SERVICE_TYPES: readonly ServiceType[] = ["windows", "docker", "dev"];
const REQUIRED_KEYS = new Set<keyof SettingsValues>([
    "FN_AUTH_HEADER",
    "FN_SERVICE_TYPE",
    "FN_AUTH_KEY",
]);

type SettingsFile = {
    Values?: Partial<SettingsValues> & Record<string, unknown>;
};

const localRequire = createRequire(import.meta.url);
let settings: SettingsFile = {};
try {
    settings = localRequire("../../local.settings.json") as SettingsFile;
} catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "MODULE_NOT_FOUND") {
        settings = {};
    } else {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to read local.settings.json: ${message}`);
    }
}

/** Read a known typed setting. Throws if the key is required and missing. */
function getSettings<K extends keyof SettingsValues>(key: K, defaultValue?: SettingsValues[K]): SettingsValues[K];
/** Read an arbitrary string key (e.g. from a user-defined helper). Returns undefined if unset. */
function getSettings(key: string, defaultValue?: string): string | undefined;
function getSettings(key: string, defaultValue?: unknown): unknown {
    const value = readSetting(key);
    if (value !== undefined) return value;
    if (defaultValue !== undefined) return defaultValue;
    if (REQUIRED_KEYS.has(key as keyof SettingsValues)) {
        throw new Error(`${key} is required but was not set in local.settings.json or the environment`);
    }
    return undefined;
}

function readSetting(key: string): unknown {
    const values = settings.Values as Record<string, unknown> | undefined;
    if (values?.[key] !== undefined) return values[key];
    if (process.env[key] !== undefined) return process.env[key];
    return undefined;
}

function isBlank(value: unknown): boolean {
    return typeof value !== "string" || value.trim().length === 0;
}

function isServiceType(value: unknown): value is ServiceType {
    return typeof value === "string" && SERVICE_TYPES.includes(value as ServiceType);
}

function validateIntegerSetting(errors: string[], key: keyof SettingsValues, min: number, max?: number): void {
    const raw = readSetting(key);
    if (raw === undefined) return;
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isInteger(value) || value < min || (max !== undefined && value > max)) {
        errors.push(`${key} must be an integer${max === undefined ? "" : ` between ${min} and ${max}`}.`);
    }
}

export function validateRuntimeSettings(): void {
    const errors: string[] = [];

    for (const key of REQUIRED_KEYS) {
        const value = readSetting(key);
        if (isBlank(value)) {
            errors.push(`${key} must be a non-empty string.`);
        }
    }

    const serviceType = readSetting("FN_SERVICE_TYPE");
    if (!isBlank(serviceType) && !isServiceType(serviceType)) {
        errors.push(`FN_SERVICE_TYPE must be one of: ${SERVICE_TYPES.join(", ")}.`);
    }

    if (serviceType === "dev" && process.env.NODE_ENV === "production" && process.env.FN_ALLOW_DEV_AUTH_BYPASS !== "true") {
        errors.push("FN_SERVICE_TYPE=dev is not allowed when NODE_ENV=production unless FN_ALLOW_DEV_AUTH_BYPASS=true is set.");
    }

    validateIntegerSetting(errors, "FN_PORT", 1, 65535);
    validateIntegerSetting(errors, "FN_RATE_LIMIT_PER_MINUTE", 0);

    const corsOrigins = readSetting("FN_CORS_ORIGINS") ?? "";
    if (typeof corsOrigins !== "string") {
        errors.push("FN_CORS_ORIGINS must be a comma-separated string.");
    }

    const bindHost = readSetting("FN_BIND_HOST") ?? "";
    if (typeof bindHost !== "string") {
        errors.push("FN_BIND_HOST must be a string.");
    }

    if (errors.length > 0) {
        throw new Error(`Invalid runtime settings:\n- ${errors.join("\n- ")}`);
    }
}

export default getSettings;
