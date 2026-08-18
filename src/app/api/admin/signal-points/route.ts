import { NextRequest, NextResponse } from "next/server";
import { classifyCompanyMember, type CompanyMemberUser } from "@/lib/company-control-room";
import { requireOwnerApiAccess } from "@/lib/owner-auth";
import { SIGNAL_REDEMPTION_STATES, type SignalRedemptionState } from "@/lib/signal-points";
import { createSignalPointsRepository } from "@/lib/signal-points-repository";

const CLOSED_REDEMPTION_STATES = new Set(["delivered", "canceled"]);

export async function GET(request: NextRequest) {
  const owner = await requireOwnerApiAccess(); if (owner.error) return owner.error;
  try {
    const repository = createSignalPointsRepository();
    if (request.nextUrl.searchParams.get("view") !== "board") {
      return NextResponse.json({ queue: await repository.listOwnerQueue() }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const [accounts, redemptions] = await Promise.all([
      repository.listOwnerMemberBalances(),
      repository.listOwnerRedemptions(),
    ]);
    const users: CompanyMemberUser[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = await owner.client.users.getUserList({ limit: 100, offset, orderBy: "+created_at" });
      users.push(...page.data as CompanyMemberUser[]);
      if (!page.data.length || offset + page.data.length >= page.totalCount) break;
    }
    const accountByUserId = new Map(accounts.map((account) => [account.userId, account]));
    const linkedUserIds = new Set(users.flatMap((user) => typeof user.id === "string" && user.id ? [user.id] : []));
    const latestRedemptionEmailByUserId = new Map<string, string>();
    for (const redemption of redemptions) {
      if (!latestRedemptionEmailByUserId.has(redemption.userId) && redemption.accountEmail) {
        latestRedemptionEmailByUserId.set(redemption.userId, redemption.accountEmail);
      }
    }
    const currentMembers = users.flatMap((user) => {
      const userId = typeof user.id === "string" ? user.id : "";
      if (!userId) return [];
      const classification = classifyCompanyMember(user);
      if (classification.isOwner || classification.isRetailer) return [];
      const account = accountByUserId.get(userId);
      const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
        || user.username?.trim()
        || classification.email.split("@")[0]
        || "Member";
      return [{
        userId,
        name,
        email: classification.email,
        tier: classification.effectiveTier,
        balance: account?.balance || 0,
        debt: account?.debt || 0,
        redemptionCount: account?.redemptionCount || 0,
        lastRedemptionAt: account?.lastRedemptionAt || null,
      }];
    });
    const unlinkedAccounts = accounts.filter((account) => !linkedUserIds.has(account.userId)).map((account) => ({
      userId: account.userId,
      name: "Former member",
      email: latestRedemptionEmailByUserId.get(account.userId) || "",
      tier: "former",
      balance: account.balance,
      debt: account.debt,
      redemptionCount: account.redemptionCount,
      lastRedemptionAt: account.lastRedemptionAt,
    }));
    const members = [...currentMembers, ...unlinkedAccounts]
      .sort((left, right) => right.balance - left.balance || left.email.localeCompare(right.email) || left.userId.localeCompare(right.userId));
    const queue = redemptions.filter((redemption) => !CLOSED_REDEMPTION_STATES.has(redemption.status));
    return NextResponse.json({
      members,
      redemptions,
      queue,
      summary: {
        totalMembers: members.length,
        membersWithPoints: members.filter((member) => member.balance > 0).length,
        totalPoints: members.reduce((sum, member) => sum + member.balance, 0),
        redemptionCount: redemptions.length,
        openRedemptionCount: queue.length,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Signal Points owner board failed", error);
    return NextResponse.json({ error: "Signal Points owner board unavailable" }, { status: 503 });
  }
}
export async function PATCH(request: NextRequest) {
  const owner = await requireOwnerApiAccess(); if (owner.error) return owner.error;
  try {
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (typeof payload.redemptionId !== "string" || !SIGNAL_REDEMPTION_STATES.includes(payload.status as SignalRedemptionState)) return NextResponse.json({ error: "Invalid transition" }, { status: 400 });
    const result = await createSignalPointsRepository().transition({
      redemptionId: payload.redemptionId, actorId: owner.userId, actorRole: "owner", nextStatus: payload.status as SignalRedemptionState,
      metadata: {
        note: typeof payload.note === "string" ? payload.note.slice(0, 500) : "",
        carrier: typeof payload.carrier === "string" ? payload.carrier.trim().slice(0, 80) : "",
        trackingNumber: typeof payload.trackingNumber === "string" ? payload.trackingNumber.trim().slice(0, 160) : "",
      },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) { console.error("Signal reward transition failed", error); return NextResponse.json({ error: "Transition unavailable" }, { status: 503 }); }
}
