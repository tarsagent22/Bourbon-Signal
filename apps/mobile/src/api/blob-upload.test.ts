import assert from "node:assert/strict";
import test from "node:test";
import { uploadClientBlob } from "./blob-upload";

test("uploads a JPEG with the authenticated Vercel Blob client-token handshake", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url === "https://example.test/api/sightings/photo") {
      return Response.json({
        type: "blob.generate-client-token",
        clientToken: "vercel_blob_client_store123_signature",
      });
    }
    return Response.json({
      url: "https://blob.test/proof.jpg",
      downloadUrl: "https://blob.test/proof.jpg?download=1",
      pathname: "sighting-proofs/sighting_123/1700000000000.jpg",
      contentType: "image/jpeg",
      contentDisposition: "inline",
      etag: "etag-1",
    });
  };
  const body = new Blob(["proof"], { type: "image/jpeg" });

  const result = await uploadClientBlob({
    pathname: "sighting-proofs/sighting_123/1700000000000.jpg",
    body,
    handleUploadUrl: "https://example.test/api/sightings/photo",
    clientPayload: JSON.stringify({ sightingId: "sighting_123" }),
    authorization: "Bearer clerk-token",
    fetcher,
  });

  assert.equal(result.url, "https://blob.test/proof.jpg");
  assert.equal(requests.length, 2);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    type: "blob.generate-client-token",
    payload: {
      pathname: "sighting-proofs/sighting_123/1700000000000.jpg",
      clientPayload: JSON.stringify({ sightingId: "sighting_123" }),
      multipart: false,
    },
  });
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer clerk-token");
  assert.equal(requests[1]?.url, "https://vercel.com/api/blob/?pathname=sighting-proofs%2Fsighting_123%2F1700000000000.jpg");
  const uploadHeaders = new Headers(requests[1]?.init?.headers);
  assert.equal(uploadHeaders.get("authorization"), "Bearer vercel_blob_client_store123_signature");
  assert.equal(uploadHeaders.get("x-vercel-blob-store-id"), "store123");
  assert.equal(uploadHeaders.get("x-api-version"), "12");
  assert.equal(uploadHeaders.get("x-content-type"), "image/jpeg");
  assert.equal(requests[1]?.init?.body, body);
});

test("rejects malformed token responses before uploading bytes", async () => {
  const fetcher: typeof fetch = async () => Response.json({ type: "wrong" });
  await assert.rejects(
    uploadClientBlob({
      pathname: "sighting-proofs/sighting_123/1700000000000.jpg",
      body: new Blob(["proof"], { type: "image/jpeg" }),
      handleUploadUrl: "https://example.test/api/sightings/photo",
      clientPayload: "{}",
      authorization: "Bearer clerk-token",
      fetcher,
    }),
    /did not return a valid client token/i,
  );
});
