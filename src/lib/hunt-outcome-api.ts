import {
  isHuntOutcome,
  type HuntOutcomeRecord,
  type HuntOutcomeRepository,
  type HuntOutcomeSignalReference,
  type HuntOutcomeSourceType,
} from "./hunt-outcome-repository.ts";
import { signalIdParts, SIGNAL_API_VERSION } from "./signals/signal-api-contract.ts";
import {
  PRIVATE_SIGNAL_API_HEADERS,
  signalApiError,
} from "./signals/signal-api-route.ts";

type OutcomeRepository = Pick<HuntOutcomeRepository, "getForUser" | "setForUser" | "removeForUser">;
type SignalReader = (request: Request, signalId: string) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function outcomeResponse(outcome: HuntOutcomeRecord | null) {
  return Response.json({ contractVersion: SIGNAL_API_VERSION, outcome }, { headers: PRIVATE_SIGNAL_API_HEADERS });
}

async function accessibleSignalReference(
  request: Request,
  signalId: string,
  readSignal: SignalReader,
): Promise<{ reference: HuntOutcomeSignalReference } | { response: Response }> {
  if (!signalIdParts(signalId)) {
    return { response: signalApiError(400, "INVALID_REQUEST", "Signal ID is invalid.") };
  }
  const signalResponse = await readSignal(request, signalId);
  if (!signalResponse.ok) {
    if (signalResponse.status === 400) {
      return { response: signalApiError(400, "INVALID_REQUEST", "Signal ID is invalid.") };
    }
    if (signalResponse.status === 403 || signalResponse.status === 404) {
      return { response: signalApiError(404, "SIGNAL_NOT_FOUND", "Signal not found.") };
    }
    if (signalResponse.status === 401) {
      return { response: signalApiError(401, "UNAUTHORIZED", "Sign in to continue.") };
    }
    return { response: signalApiError(503, "UPSTREAM_UNAVAILABLE", "Signal service is temporarily unavailable.", true) };
  }
  const payload = await signalResponse.json().catch(() => null);
  const signal = isRecord(payload) && isRecord(payload.signal) ? payload.signal : null;
  if (!signal || text(signal.id) !== signalId) {
    return { response: signalApiError(404, "SIGNAL_NOT_FOUND", "Signal not found.") };
  }
  if (signal.kind !== "availability") {
    return { response: signalApiError(409, "ACTION_NOT_AVAILABLE", "Hunt Outcome is available only for availability Signals.") };
  }
  const source = isRecord(signal.source) ? signal.source : {};
  const sourceType = text(source.type);
  if (sourceType !== "member" && sourceType !== "retailer" && sourceType !== "trusted_source" && sourceType !== "release_source") {
    return { response: signalApiError(503, "UPSTREAM_UNAVAILABLE", "Signal source is unavailable.", true) };
  }
  const availability = isRecord(signal.availability) ? signal.availability : {};
  const episodeId = text(
    signal.availabilityEpisodeId,
    availability.episodeId,
    availability.availabilityEpisodeId,
    signal.id,
  );
  if (!episodeId) {
    return { response: signalApiError(503, "UPSTREAM_UNAVAILABLE", "Signal episode is unavailable.", true) };
  }
  const location = isRecord(signal.location) ? signal.location : {};
  const store = isRecord(location.store) ? location.store : {};
  const state = text(location.state, store.state)?.toUpperCase() || null;
  return {
    reference: {
      signalId,
      availabilityEpisodeId: episodeId,
      sourceType: sourceType as HuntOutcomeSourceType,
      stateCode: state && /^[A-Z]{2}$/.test(state) ? state : null,
    },
  };
}

export function createHuntOutcomeApi({
  repository,
  readSignal,
  now = () => new Date().toISOString(),
}: {
  repository: OutcomeRepository;
  readSignal: SignalReader;
  now?: () => string;
}) {
  async function resolve(request: Request, signalId: string) {
    return accessibleSignalReference(request, signalId, readSignal);
  }

  return {
    async get(request: Request, signalId: string, userId: string) {
      const access = await resolve(request, signalId);
      if ("response" in access) return access.response;
      const outcome = await repository.getForUser(userId, access.reference.availabilityEpisodeId);
      return outcomeResponse(outcome);
    },

    async put(request: Request, signalId: string, userId: string) {
      const payload = await request.json().catch(() => null);
      if (!isRecord(payload) || !("outcome" in payload) || (payload.outcome !== null && !isHuntOutcome(payload.outcome))) {
        return signalApiError(400, "INVALID_REQUEST", "Outcome must be found_it, gone_when_checked, didnt_go, or null.");
      }
      const access = await resolve(request, signalId);
      if ("response" in access) return access.response;
      if (payload.outcome === null) {
        await repository.removeForUser(userId, access.reference.availabilityEpisodeId);
        return outcomeResponse(null);
      }
      const outcome = await repository.setForUser(userId, access.reference, payload.outcome, now());
      return outcomeResponse(outcome);
    },

    async remove(request: Request, signalId: string, userId: string) {
      const access = await resolve(request, signalId);
      if ("response" in access) return access.response;
      await repository.removeForUser(userId, access.reference.availabilityEpisodeId);
      return outcomeResponse(null);
    },
  };
}
