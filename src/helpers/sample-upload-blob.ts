import getSettings from "../runtime/settings.ts";
import { log } from "../runtime/log.ts";

// Dependency-free sample upload using a container-scoped SAS URL.
// For production blob-heavy actions, you may prefer the Azure SDK for retries,
// richer errors, metadata, streams, content settings, and non-SAS auth flows:
//     npm install @azure/storage-blob
// and then use BlobClient / BlockBlobClient from the Azure SDK instead.
export default async function uploadBlob(fileName: string, fileContents: string): Promise<void> {
    if (!fileName || fileName.includes("/") || fileName.includes("\\") || fileName.includes("..") || fileName.includes("?")) {
        throw new Error("Invalid filename");
    }
    const safeName = encodeURIComponent(fileName);

    const containerSas = getSettings("WEBSITE_BLOB_SAS");
    if (!containerSas) throw new Error("WEBSITE_BLOB_SAS is not set");

    // Assumes a container-scoped SAS whose query string begins with `?sv=`.
    const fileSas = containerSas.replace("?sv=", `/${safeName}?sv=`);

    const response = await fetch(fileSas, {
        method: "PUT",
        headers: {
            "x-ms-blob-type": "BlockBlob",
            "content-type": "text/plain; charset=utf-8",
        },
        body: fileContents,
    });

    if (!response.ok) {
        throw new Error(`Blob upload failed: HTTP ${response.status}`);
    }

    log(`Uploaded blob ${fileName}`);
}
