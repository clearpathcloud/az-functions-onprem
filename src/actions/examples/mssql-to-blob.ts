// Recipe: SQL Server table → JSON blob upload.
//
// Prerequisite: `npm install mssql`
//
// Common use case: nightly snapshot of an on-prem ERP table (Dynamics GP,
// Business Central, internal warehouse) written to Azure Blob so a downstream
// website / CRM / analytics layer can pick it up. Once your data leaves the
// firewall this action moves to cloud-native; until then, this is the bridge.
//
// To activate: install mssql, drop this file in src/actions/ (out of examples/),
// add `import "./mssql-to-blob.ts";` to src/actions/index.ts, and uncomment the
// implementation block below.

import { defineAction } from "../../runtime/registry.ts";
import getSettings from "../../runtime/settings.ts";
import uploadBlob from "../../helpers/sample-upload-blob.ts";

defineAction({
    name: "mssqlToBlob",
    description: "Snapshot a SQL Server table to JSON blob.",
    schedule: "0 2 * * *", // 02:00 daily
    timeoutMs: 5 * 60_000,
    handler: async () => {
        // Uncomment after `npm install mssql`:
        //
        //     const sql = await import("mssql");
        //     const pool = await new sql.default.ConnectionPool(getSettings("GP_CONNECTIONSTRING")).connect();
        //     const result = await pool.request().query("SELECT * FROM dbo.Customers");
        //     await pool.close();
        //     const payload = JSON.stringify(result.recordset);
        //     await uploadBlob("customers.json", payload);
        //     return { rows: result.recordset.length };

        void getSettings;
        void uploadBlob;
        return { todo: "install mssql and uncomment the handler body" };
    },
});
