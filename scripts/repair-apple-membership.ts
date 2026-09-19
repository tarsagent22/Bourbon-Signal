import { configuredAppleMembershipService, createAppleMembershipRepair } from "../src/lib/apple-membership-service.ts";

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length).trim() || "";
}

async function main() {
  const clerkUserId = argument("user");
  const apply = process.argv.slice(2).includes("--apply");
  if (!clerkUserId) throw new Error("Pass one Clerk user with --user=<id>.");
  if (apply && process.env.APPLE_MEMBERSHIP_REPAIR_ENABLED !== "true") {
    throw new Error("Apple membership repair apply mode is disabled.");
  }
  const service = configuredAppleMembershipService();
  if (!service.ready) throw new Error(`Apple membership repair is blocked: ${service.configuration.blocker}.`);
  const repair = createAppleMembershipRepair(service);
  const result = await repair({ clerkUserId, dryRun: !apply });
  process.stdout.write(`${JSON.stringify({
    dryRun: !apply,
    action: "outcome" in result ? result.outcome : result.action,
    status: "membership" in result ? result.membership.status : result.status,
    effectiveTier: "effectiveTier" in result ? result.effectiveTier : undefined,
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Apple membership repair failed."}\n`);
  process.exitCode = 1;
});
