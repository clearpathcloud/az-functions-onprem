import { service, serviceDefinition } from "../../src/config/windows-service.ts";

service.on("uninstall", () => {
    console.log("Uninstall complete.");
    console.log(`The service '${serviceDefinition.name}' exists ${service.exists}`);
});

service.on("alreadyuninstalled", () => {
    console.log(`The service '${serviceDefinition.name}' is already uninstalled.`);
});

service.uninstall();
