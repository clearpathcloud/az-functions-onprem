// Recipe: pull a SharePoint list via Microsoft Graph, write to blob.
//
// Prerequisites: `npm install @azure/msal-node`
// Plus an Azure AD app registration with `Sites.Read.All` (or per-site) application permission.
//
// Common use case: surface a SharePoint list (vendor register, project roster,
// approved-supplier list) to a public website or analytics tool while keeping
// the authoritative copy in SharePoint. Eventually you'd move this to a Logic
// App or Power Automate flow; this template covers the gap while access is
// gated to on-prem identity.
//
// To activate: install msal-node, fill in TENANT_ID / CLIENT_ID / CLIENT_SECRET
// / SITE_ID / LIST_ID, drop this file in src/actions/ (out of examples/), add
// `import "./sharepoint-list-sync.ts";` to src/actions/index.ts.

import { defineAction } from "../../runtime/registry.ts";
import getSettings from "../../runtime/settings.ts";
import uploadBlob from "../../helpers/sample-upload-blob.ts";

defineAction({
    name: "sharepointListSync",
    description: "Pull a SharePoint list via Graph, write to blob.",
    schedule: "0 */30 * * * *",
    timeoutMs: 2 * 60_000,
    handler: async () => {
        // Uncomment after `npm install @azure/msal-node`:
        //
        //     const { ConfidentialClientApplication } = await import("@azure/msal-node");
        //     const tenantId = getSettings("TENANT_ID") ?? "";
        //     const cca = new ConfidentialClientApplication({
        //         auth: {
        //             clientId: getSettings("CLIENT_ID") ?? "",
        //             clientSecret: getSettings("CLIENT_SECRET") ?? "",
        //             authority: `https://login.microsoftonline.com/${tenantId}`,
        //         },
        //     });
        //     const tokenResp = await cca.acquireTokenByClientCredential({
        //         scopes: ["https://graph.microsoft.com/.default"],
        //     });
        //     const token = tokenResp?.accessToken;
        //     if (!token) throw new Error("Failed to acquire Graph token");
        //
        //     const items: unknown[] = [];
        //     let next: string | null =
        //         `https://graph.microsoft.com/v1.0/sites/${getSettings("SITE_ID") ?? ""}` +
        //         `/lists/${getSettings("LIST_ID") ?? ""}/items?expand=fields&$top=200`;
        //     while (next) {
        //         const r = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
        //         if (!r.ok) throw new Error(`Graph ${r.status}: ${await r.text()}`);
        //         const page = (await r.json()) as { value: unknown[]; "@odata.nextLink"?: string };
        //         items.push(...page.value);
        //         next = page["@odata.nextLink"] ?? null;
        //     }
        //     await uploadBlob("sharepoint-list.json", JSON.stringify(items));
        //     return { count: items.length };

        void getSettings;
        void uploadBlob;
        return { todo: "install @azure/msal-node and uncomment the handler body" };
    },
});
