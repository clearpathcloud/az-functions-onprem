import { service, serviceDefinition } from "../../src/config/windows-service";

service.on("install", () => {
    service.start();
    console.log(`Install complete. Service '${serviceDefinition.name}' running.`);
});

service.install();
