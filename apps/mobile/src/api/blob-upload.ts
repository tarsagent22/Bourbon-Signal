export interface ClientBlobUploadResult {
  url: string;
  downloadUrl: string;
  pathname: string;
  contentType: string;
  contentDisposition: string;
  etag: string;
}

interface UploadClientBlobInput {
  pathname: string;
  body: Blob;
  handleUploadUrl: string;
  clientPayload: string;
  authorization: string;
  fetcher?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readJson(response: Response, stage: string) {
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === "string" ? payload.error : `${stage} failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

export async function uploadClientBlob({
  pathname,
  body,
  handleUploadUrl,
  clientPayload,
  authorization,
  fetcher = fetch,
}: UploadClientBlobInput): Promise<ClientBlobUploadResult> {
  const tokenResponse = await fetcher(handleUploadUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: "blob.generate-client-token",
      payload: { pathname, clientPayload, multipart: false },
    }),
  });
  const tokenPayload = await readJson(tokenResponse, "Photo upload authorization");
  const clientToken = isRecord(tokenPayload) && typeof tokenPayload.clientToken === "string" ? tokenPayload.clientToken : "";
  const storeId = clientToken.split("_")[3] || "";
  if (!clientToken.startsWith("vercel_blob_client_") || !storeId) {
    throw new Error("Photo upload authorization did not return a valid client token.");
  }

  const uploadResponse = await fetcher(`https://vercel.com/api/blob/?pathname=${encodeURIComponent(pathname)}`, {
    method: "PUT",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${clientToken}`,
      "x-add-random-suffix": "0",
      "x-allow-overwrite": "0",
      "x-api-blob-request-attempt": "0",
      "x-api-blob-request-id": `${storeId}:${Date.now()}:${Math.random().toString(16).slice(2)}`,
      "x-api-version": "12",
      "x-content-type": "image/jpeg",
      "x-vercel-blob-access": "public",
      "x-vercel-blob-store-id": storeId,
    },
    body,
  });
  const uploaded = await readJson(uploadResponse, "Photo upload");
  if (!isRecord(uploaded)
    || typeof uploaded.url !== "string"
    || typeof uploaded.downloadUrl !== "string"
    || typeof uploaded.pathname !== "string"
    || typeof uploaded.contentType !== "string"
    || typeof uploaded.contentDisposition !== "string"
    || typeof uploaded.etag !== "string") {
    throw new Error("Photo upload returned an invalid response.");
  }
  return uploaded as unknown as ClientBlobUploadResult;
}
