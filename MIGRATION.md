# Azure Functions Migration Notes

Action handlers are deliberately close to Azure Functions v4. This template is not Azure Functions, but the handler shape, `context.log`, `context.invocationId`, and `httpResponse({...})` names are chosen so moving later is mostly mechanical.

```ts
// Here:
defineAction({
    name: "syncCustomers",
    methods: ["POST"],
    handler: async (request, context) => {
        context.log("starting sync");
        return httpResponse({ status: 201, jsonBody: { count: 42 } });
    },
});

// Azure Functions v4:
app.http("syncCustomers", {
    methods: ["POST"],
    authLevel: "function",
    handler: async (request, context) => {
        context.log("starting sync");
        return { status: 201, jsonBody: { count: 42 } };
    },
});
```

Main differences:

- Request body here is sync: `request.body`, already parsed by Express.
- Azure Functions v4 uses async body helpers such as `await request.json()`.
- Cron should use 6-field NCRONTAB if you expect to port schedules to Timer triggers.

Useful Azure Functions docs:

- [Node.js developer guide](https://learn.microsoft.com/en-us/azure/azure-functions/functions-reference-node) - JavaScript / TypeScript programming model.
- [HTTP trigger](https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-http-webhook-trigger) - `app.http()`, methods, routes, auth levels, request/response shape.
- [Timer trigger](https://learn.microsoft.com/azure/azure-functions/functions-bindings-timer?tabs=nodejs-v4) - NCRONTAB schedules and timer behavior.
- [Triggers and bindings](https://learn.microsoft.com/en-us/azure/azure-functions/functions-triggers-bindings) - how Functions connects to queues, blobs, databases, and other services.
- [Core Tools](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local) - local Azure Functions runtime, `func start`, and deployment commands.
- [Node.js v4 migration guide](https://learn.microsoft.com/en-us/azure/azure-functions/functions-node-upgrade-v4) - useful when comparing this template's handler shape to real Functions v4.
