import { Service } from "node-windows";
import * as path from "path";

export const serviceDefinition = {
    name: "AZ Functions OnPrem",
    description: "Self-hosted Azure-Functions-style integrations runtime.",
    script: path.join(import.meta.dirname, "..", "server.ts"),
};
export const service = new Service(serviceDefinition);
