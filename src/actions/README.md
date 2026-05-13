# actions

This folder is yours. Define integration actions here.

```ts
// src/actions/sync-customers.ts
import { defineAction } from "../runtime/registry.ts";

defineAction({
    name: "syncCustomers",
    description: "Pull customers from CRM, write to blob.",
    handler: async (request, context) => {
        context.log("starting");
        // ... your work
        return { count: 42 };
    },
});
```

Then wire it up in `src/actions/index.ts`:

```ts
import "./sync-customers.ts";
```

The runtime auto-registers `GET`/`POST /action/syncCustomers` by default, plus the index card, OpenAPI entry, and cron job when `schedule` is set.

## Action forms

An action takes one of three forms, picked by which field you supply:

- `handler: (request, context) => result` - one-shot, JSON wrapped as `{ action, result }`.
- `steps: ["a", "b"]` - sequence of other registered actions; streamed as NDJSON step events.
- `stream: async function*(request, context) { yield ... }` - async generator, NDJSON one line per yield.

All three accept optional `timeoutMs`, `onSuccess(result, request, context)`, `schedule` (cron), `methods` (default `["GET","POST"]`), `authLevel` (`anonymous` / `key` / `header`, default `header`), and `concurrency` (per-action in-flight cap).

`request` is `HttpRequest | undefined` - undefined when the scheduler triggered the action. For HTTP-only actions, call `requireRequest(request)` at the top to assert and narrow. Scheduled stream actions are drained to completion; yielded chunks are not sent anywhere unless your action logs or writes them to a downstream system.

## Sample files

`sample-handler.ts`, `sample-stream.ts`, `sample-sequence.ts` are starter examples. Delete them when you're writing your own.

### Common on-prem packages

Not bundled. You can install these using `npm i` and then import them to use them.

- **`mssql`** - SQL Server. See `src/actions/examples/mssql-to-blob.ts`.
- **`@azure/msal-node`** - Entra auth for Graph / SharePoint / Dataverse. See `src/actions/examples/sharepoint-list-sync.ts`.
- **`ldapjs`** - Active Directory queries.
- **`pino`** - structured JSON logging.
