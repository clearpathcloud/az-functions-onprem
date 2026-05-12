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
    settings = {};
}

/** Read a known typed setting. Throws if the key is required and missing. */
function getSettings<K extends keyof SettingsValues>(key: K, defaultValue?: SettingsValues[K]): SettingsValues[K];
/** Read an arbitrary string key (e.g. from a user-defined helper). Returns undefined if unset. */
function getSettings(key: string, defaultValue?: string): string | undefined;
function getSettings(key: string, defaultValue?: unknown): unknown {
    const values = settings.Values as Record<string, unknown> | undefined;
    if (values?.[key] !== undefined) return values[key];
    if (process.env[key] !== undefined) return process.env[key];
    if (defaultValue !== undefined) return defaultValue;
    if (REQUIRED_KEYS.has(key as keyof SettingsValues)) {
        throw new Error(`${key} is required but was not set in local.settings.json or the environment`);
    }
    return undefined;
}

export default getSettings;
