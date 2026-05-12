import { BlobClient } from "@azure/storage-blob";
import getSettings from "../runtime/settings.ts";
import { log } from "../runtime/log.ts";

export default async function uploadBlob(fileName: string, fileContents: string) {
    if (!fileName || fileName.includes("/") || fileName.includes("\\") || fileName.includes("..") || fileName.includes("?")) {
        throw new Error("Invalid filename");
    }
    const safeName = encodeURIComponent(fileName);

    let connStrings = [];
    let s1 = getSettings("WEBSITE_BLOB_SAS");
    if (s1) connStrings.push(s1);
    if (connStrings.length === 0) throw new Error("No connection strings found");

    await Promise.all(
        connStrings.map(async (connStr) => {
            const fileConStr = connStr.replace("?sv=", `/${safeName}?sv=`);

            let blobClient = new BlobClient(fileConStr);
            let blockBlobClient = blobClient.getBlockBlobClient();
            await blockBlobClient.upload(fileContents, fileContents.length);
            log(`  Upload block blob ${blobClient.containerName}/${blobClient.name} successfully`);
        })
    );
}
