import { AppStoreServerAPIClient, Environment, SignedDataVerifier, type JWSTransactionDecodedPayload } from "@apple/app-store-server-library";
import { AppleMembershipError, type AppleMembershipEnvironment, type AppleMembershipProductId } from "./apple-membership.ts";
import { APPLE_ROOT_CA_G3 } from "./apple-root-ca.ts";

const BUNDLE_ID = "com.bourbonsignal.app";
const APP_ID = 6804261265;

export type AppleTransactionLookup = {
  transactionId: string;
  productId: AppleMembershipProductId;
  environment: AppleMembershipEnvironment;
};

export function validateAppleTransaction(input: AppleTransactionLookup, decoded: JWSTransactionDecodedPayload) {
  const environment = input.environment === "sandbox" ? Environment.SANDBOX : Environment.PRODUCTION;
  if (decoded.bundleId !== BUNDLE_ID || decoded.environment !== environment
    || decoded.transactionId !== input.transactionId || decoded.productId !== input.productId
    || !decoded.originalTransactionId || !/^\d+$/.test(decoded.originalTransactionId)
    || decoded.type !== "Auto-Renewable Subscription") {
    throw new AppleMembershipError("PROVIDER_RESPONSE_INVALID", "Apple transaction does not match the verified subscription.");
  }
  return { originalTransactionId: decoded.originalTransactionId, revokedAt: decoded.revocationDate };
}

export function createAppleTransactionVerifier(env: Record<string, string | undefined>) {
  const key = (env.APPLE_IAP_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  const keyId = env.APPLE_IAP_KEY_ID?.trim() || "";
  const issuerId = env.APPLE_IAP_ISSUER_ID?.trim() || "";
  const clients = new Map<AppleMembershipEnvironment, { client: AppStoreServerAPIClient; verifier: SignedDataVerifier }>();
  return async (input: AppleTransactionLookup) => {
    if (!key || !keyId || !issuerId) throw new AppleMembershipError("BACKEND_NOT_CONFIGURED", "Apple transaction verification is not configured.");
    let provider = clients.get(input.environment);
    if (!provider) {
      const environment = input.environment === "sandbox" ? Environment.SANDBOX : Environment.PRODUCTION;
      provider = {
        client: new AppStoreServerAPIClient(key, keyId, issuerId, BUNDLE_ID, environment),
        verifier: new SignedDataVerifier([APPLE_ROOT_CA_G3], true, environment, BUNDLE_ID, APP_ID),
      };
      clients.set(input.environment, provider);
    }
    try {
      const response = await provider.client.getTransactionInfo(input.transactionId);
      if (!response.signedTransactionInfo) throw new Error("Missing signed transaction");
      const decoded = await provider.verifier.verifyAndDecodeTransaction(response.signedTransactionInfo);
      return validateAppleTransaction(input, decoded);
    } catch (error) {
      if (error instanceof AppleMembershipError) throw error;
      throw new AppleMembershipError("PROVIDER_UNAVAILABLE", "Apple transaction verification is temporarily unavailable.");
    }
  };
}
