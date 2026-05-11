import { BlobClient } from "@azure/storage-blob";
import getSettings from "./settings.ts";
import { log } from "./log.ts";

export default async function uploadBlob(fileName: string, fileContents: string) {
    let connStrings = [];
    let s1 = getSettings("WEBSITE_BLOB_SAS");
    if (s1) connStrings.push(s1);
    if (connStrings.length === 0) throw new Error("No connection strings found");

    // upload to all found locations
    await Promise.all(
        connStrings.map(async (connStr) => {
            // insert the filename into the connection string
            const fileConStr = connStr.replace("?sv=", `/${fileName}?sv=`);

            // connect and upload
            let blobClient = new BlobClient(fileConStr);
            let blockBlobClient = blobClient.getBlockBlobClient();
            await blockBlobClient.upload(fileContents, fileContents.length);
            log(`  Upload block blob ${blobClient.containerName}/${blobClient.name} successfully`);
        })
    );
}
