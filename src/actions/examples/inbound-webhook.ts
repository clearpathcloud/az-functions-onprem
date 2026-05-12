// Recipe: receive a POST webhook, verify HMAC, project into internal storage.
//
// Common use case: a SaaS (Stripe, GitHub, Slack, custom partner) sends events
// your on-prem systems need to react to but can't expose to the public internet.
// Run this template behind Azure App Proxy, take the webhook at /action/inboundWebhook,
// verify the provider's signature, then write into your DB / SharePoint / event bus.
//
// Replace WEBHOOK_SECRET with whatever your provider gave you.
//
// Note: real providers usually require the **raw** request body for HMAC.
// express.json discards that by default - capture it via
// `express.json({ verify: (req, res, buf) => { (req as any).rawBody = buf; } })`
// and read `(ctx.req as any).rawBody` here. The example below verifies against
// the parsed body, which works only if the provider signed the canonical JSON
// form you'll re-serialise. Read your provider's signature docs.

import { defineAction, httpCtx } from "../../runtime/registry.ts";
import { verifyHmac } from "../../helpers/sample-verify-hmac.ts";

defineAction({
    name: "inboundWebhook",
    description: "Receive a partner webhook, verify HMAC, hand off to internal systems.",
    method: "POST",
    auth: "anonymous", // The HMAC is the auth; our key/proxy gates do not apply here.
    handler: async (ctx) => {
        const { req } = httpCtx(ctx);
        const secret = process.env.WEBHOOK_SECRET ?? "";
        const signature = String(req.get("x-signature") ?? "");
        const raw = JSON.stringify(req.body);

        if (!verifyHmac(secret, raw, signature)) {
            throw new Error("Invalid signature");
        }

        // Do something with the verified payload - write to a queue, file, DB, etc.
        // const payload = req.body;
        // await yourInternalSink(payload);

        return { received: true };
    },
});
