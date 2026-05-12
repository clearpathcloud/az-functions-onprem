import { BlobClient } from "@azure/storage-blob";
import getSettings from "../runtime/settings.ts";
import { log } from "../runtime/log.ts";

export default async function uploadBlob(fileName: string, fileContents: string): Promise<void> {
    if (!fileName || fileName.includes("/") || fileName.includes("\\") || fileName.includes("..") || fileName.includes("?")) {
        throw new Error("Invalid filename");
    }
    const safeName = encodeURIComponent(fileName);

    const containerSas = getSettings("WEBSITE_BLOB_SAS");
    if (!containerSas) throw new Error("WEBSITE_BLOB_SAS is not set");

    // Assumes a container-scoped SAS whose query string begins with `?sv=`.
    // Replace this with a proper URL parse if your SAS format differs.
    const fileSas = containerSas.replace("?sv=", `/${safeName}?sv=`);

    const blobClient = new BlobClient(fileSas);
    const blockBlobClient = blobClient.getBlockBlobClient();
    await blockBlobClient.upload(fileContents, fileContents.length);
    log(`Uploaded blob ${blobClient.containerName}/${blobClient.name}`);
}
