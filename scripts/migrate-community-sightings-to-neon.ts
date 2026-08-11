import { createClerkClient } from "@clerk/backend";
import { createCommunitySightingsRepository } from "../src/lib/community-sightings-repository";
import type { MemberSighting, SightingVote, SightingsPreferences } from "../src/lib/sightings";

const apply = process.argv.includes("--apply");
const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) throw new Error("Missing CLERK_SECRET_KEY.");

function preferences(value: unknown): SightingsPreferences {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    submittedSightings: Array.isArray(source.submittedSightings)
      ? source.submittedSightings.filter((item): item is MemberSighting => Boolean(item && typeof item === "object" && (item as MemberSighting).id))
      : [],
    signalReports: [],
    sightingVotes: Array.isArray(source.sightingVotes)
      ? source.sightingVotes.filter((item): item is SightingVote => Boolean(item && typeof item === "object" && (item as SightingVote).sightingId))
      : [],
  };
}

function memberFacingBadgeLabel(label: unknown) {
  if (typeof label !== "string") return "";
  return label.replace(/Verified Scout/gi, "Helpful Neighbor").replace(/verified/gi, "helpful");
}

function badges(privateMetadata: unknown) {
  const source = privateMetadata && typeof privateMetadata === "object" ? privateMetadata as Record<string, unknown> : {};
  const rewards = source.memberRewards && typeof source.memberRewards === "object" ? source.memberRewards as Record<string, unknown> : {};
  const rows = Array.isArray(rewards.badges) ? rewards.badges as Array<Record<string, unknown>> : [];
  return rows.slice(0, 2).map((badge) => [memberFacingBadgeLabel(badge.label), badge.tier].filter(Boolean).join(" "));
}

async function main() {
  const clerk = createClerkClient({ secretKey });
  const repository = createCommunitySightingsRepository();
  let offset = 0;
  let usersScanned = 0;
  let sightingsFound = 0;
  let votesFound = 0;
  let sightingsWritten = 0;
  let votesWritten = 0;
  let orphanVotesSkipped = 0;
  const deferredVotes: Array<{ sightingId: string; userId: string; kind: "up" | "down" }> = [];

  while (true) {
    const response = await clerk.users.getUserList({ limit: 100, offset });
    const users = Array.isArray(response) ? response : response.data;
    for (const user of users) {
      usersScanned += 1;
      const prefs = preferences(user.publicMetadata?.sightingsPreferences);
      const reporterBadges = badges(user.privateMetadata);
      for (const sighting of prefs.submittedSightings) {
        sightingsFound += 1;
        if (!apply) continue;
        await repository.insertSightingIfAbsent({
          ...sighting,
          reporterUserId: sighting.reporterUserId || user.id,
          reporterDisplayName: sighting.reporterDisplayName || user.firstName || "Member",
          reporterBadges: reporterBadges.length ? reporterBadges : sighting.reporterBadges,
        });
        sightingsWritten += 1;
      }
      for (const vote of prefs.sightingVotes || []) {
        if (vote.kind !== "up" && vote.kind !== "down") continue;
        votesFound += 1;
        if (!apply) continue;
        if (!await repository.getSighting(vote.sightingId)) {
          deferredVotes.push({ sightingId: vote.sightingId, userId: user.id, kind: vote.kind });
          continue;
        }
        await repository.setVote(vote.sightingId, user.id, vote.kind);
        votesWritten += 1;
      }
    }
    if (users.length < 100) break;
    offset += users.length;
  }

  for (const vote of deferredVotes) {
    if (!await repository.getSighting(vote.sightingId)) {
      orphanVotesSkipped += 1;
      continue;
    }
    await repository.setVote(vote.sightingId, vote.userId, vote.kind);
    votesWritten += 1;
  }

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", usersScanned, sightingsFound, votesFound, sightingsWritten, votesWritten, orphanVotesSkipped }));
}

void main();
