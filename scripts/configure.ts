import { access, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, exit } from "node:process";

const TARGET = "./local.settings.json";
const SERVICE_TYPES = ["docker", "windows", "dev"] as const;
type ServiceType = (typeof SERVICE_TYPES)[number];

async function exists(p: string): Promise<boolean> {
    try {
        await access(p);
        return true;
    } catch {
        return false;
    }
}

async function main() {
    const rl = createInterface({ input: stdin, output: stdout });
    const ask = async (label: string, fallback?: string): Promise<string> => {
        const prompt = fallback ? `${label} [${fallback}]: ` : `${label}: `;
        const answer = (await rl.question(prompt)).trim();
        return answer || fallback || "";
    };

    if (await exists(TARGET)) {
        const overwrite = await ask("local.settings.json already exists. Overwrite? (y/N)", "N");
        if (overwrite.toLowerCase() !== "y") {
            console.log("Aborted. Existing file left in place.");
            rl.close();
            return;
        }
    }

    console.log("\nConfiguring local.settings.json. Press Enter to accept the default in brackets.\n");

    let serviceType: ServiceType | undefined;
    while (!serviceType) {
        const input = (await ask(`SERVICE_TYPE (${SERVICE_TYPES.join("|")})`)).toLowerCase();
        if (SERVICE_TYPES.includes(input as ServiceType)) {
            serviceType = input as ServiceType;
        } else {
            console.log(`  must be one of: ${SERVICE_TYPES.join(", ")}`);
        }
    }

    const azureToken = await ask("AZURE_CUSTOM_HEADER_TOKEN (proxy header secret)", randomUUID());
    const apiKey = await ask("WEB_INTEGRATIONS_API_KEY (query-string fallback secret)", randomUUID());
    const blobSas = await ask("WEBSITE_BLOB_SAS (paste full SAS URL or leave blank)", "");
    const portInput = await ask("PORT", "3000");
    const port = Number.parseInt(portInput, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        console.error(`PORT must be an integer between 1 and 65535 (got "${portInput}")`);
        rl.close();
        exit(1);
    }

    const payload = {
        $schema: "./local.settings.schema.json",
        Values: {
            AZURE_CUSTOM_HEADER_TOKEN: azureToken,
            SERVICE_TYPE: serviceType,
            WEB_INTEGRATIONS_API_KEY: apiKey,
            WEBSITE_BLOB_SAS: blobSas,
            PORT: port,
        },
    };

    await writeFile(TARGET, JSON.stringify(payload, null, 4) + "\n", { encoding: "utf8", mode: 0o600 });
    rl.close();

    console.log(`\nWrote ${TARGET} (mode 0600).`);
    console.log(`  SERVICE_TYPE: ${serviceType}`);
    console.log(`  PORT:         ${port}`);
    if (!blobSas) {
        console.log("  WEBSITE_BLOB_SAS is blank; uploadBlob calls will fail until you set it.");
    }
    console.log("\nNext: npm run dev");
}

main();
