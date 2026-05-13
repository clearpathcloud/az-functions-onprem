import { service, serviceDefinition } from "../../src/config/windows-service.ts";

if (/rename me/i.test(serviceDefinition.name)) {
    console.error("Edit src/config/windows-service.ts and choose a deployment-specific service name before installing.");
    process.exit(1);
}

service.on("install", () => {
    service.start();
    console.log(`Install complete. Service '${serviceDefinition.name}' running.`);
});

service.install();
