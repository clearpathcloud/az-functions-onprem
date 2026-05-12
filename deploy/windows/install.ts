import { service, serviceDefinition } from "../../src/config/windows-service.ts";

service.on("install", () => {
    service.start();
    console.log(`Install complete. Service '${serviceDefinition.name}' running.`);
});

service.install();
