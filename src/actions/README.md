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

The runtime auto-registers the route (`GET /action/syncCustomers`), the index-page card, the OpenAPI entry, and, if you set a `schedule`, the cron job.

## Action forms

An action takes one of three forms, picked by which field you supply:

- `handler: (request, context) => result` - one-shot, JSON wrapped as `{ action, result }`.
- `steps: ["a", "b"]` - sequence of other registered actions; streamed as NDJSON step events.
- `stream: async function*(request, context) { yield ... }` - async generator, NDJSON one line per yield.

All three accept optional `timeoutMs`, `onSuccess(result, request, context)`, `schedule` (cron), `methods` (defaults to `["GET","POST"]`), and `authLevel` (`anonymous` / `key` / `header`).

`request` is `HttpRequest | undefined` - undefined when the scheduler triggered the action. For HTTP-only handlers, call `requireRequest(request)` at the top to assert and narrow.

## Sample files

`sample-handler.ts`, `sample-stream.ts`, `sample-sequence.ts` are starter examples. Delete them when you're writing your own.

## Where things live

- Runtime (framework, don't touch normally): `src/runtime/`
- Your actions: this folder
- Your helpers: `src/helpers/` (e.g. `sample-upload-blob.ts`)
- Service config: `src/config/`
- UI: `src/views/`, `src/public/`
