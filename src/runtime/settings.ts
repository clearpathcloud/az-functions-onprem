import { createRequire } from "module";

type ServiceType = "docker" | "windows" | "dev";

type SettingsValues = {
    AZURE_CUSTOM_HEADER_TOKEN: string;
    SERVICE_TYPE: ServiceType;
    WEB_INTEGRATIONS_API_KEY: string;
    WEBSITE_BLOB_SAS: string;
    PORT?: number | string;
    CORS_ORIGINS?: string;
};

type SettingsFile = {
    Values?: Partial<SettingsValues>;
};

const localRequire = createRequire(import.meta.url);
let settings: SettingsFile = {};
try {
    settings = localRequire("../../local.settings.json") as SettingsFile;
} catch (err) {
    settings = {};
}

export default function getSettings<K extends keyof SettingsValues>(key: K, defaultValue?: SettingsValues[K]): SettingsValues[K] {
    if (settings.Values?.[key] !== undefined) {
        return settings.Values[key];
    } else if (process.env[key] !== undefined) {
        return process.env[key] as SettingsValues[K];
    } else if (defaultValue !== undefined) {
        return defaultValue;
    } else {
        throw new Error(`${key} is required but was not set in local.settings.json or the environment`);
    }
}
