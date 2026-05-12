import { Service } from "node-windows";
import * as path from "path";

// Rename `name` to something specific to your deployment before running
// `npm run windows-install`. The placeholder below is intentionally generic
// so the registered Windows Service is not confused with a Microsoft product
// in services.msc / Event Viewer.
export const serviceDefinition = {
    name: "Integrations Runtime (rename me)",
    description: "On-prem integrations runtime. Edit src/config/windows-service.ts before deploying.",
    script: path.join(import.meta.dirname, "..", "server.ts"),
};
export const service = new Service(serviceDefinition);
