import { auth, clerkClient } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { isRewardsAdminEmail } from "@/lib/sighting-rewards";

type ClerkEmailUser = {
  emailAddresses?: Array<{ id?: string; emailAddress?: string; verification?: { status?: string | null } | null }>;
  primaryEmailAddressId?: string | null;
  publicMetadata?: Record<string, unknown>;
};

export function verifiedPrimaryClerkEmail(user: ClerkEmailUser | null | undefined) {
  const primary = user?.emailAddresses?.find((email) => email.id === user.primaryEmailAddressId);
  return primary?.verification?.status === "verified" ? primary.emailAddress?.trim().toLowerCase() || "" : "";
}

export async function requireSignalPointsApiAccess(messages: { unauthorized?: string; forbidden?: string } = {}) {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: messages.unauthorized || "Unauthorized" }, { status: 401 }) };
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return { client, user, userId, email: verifiedPrimaryClerkEmail(user) };
}

export async function requireSignalPointsPageAccess(redirectUrl: string) {
  const { userId } = await auth();
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`);
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return { client, user, userId };
}

export async function requireOwnerApiAccess(messages: { unauthorized?: string; forbidden?: string } = {}) {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: messages.unauthorized || "Unauthorized" }, { status: 401 }) };
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = verifiedPrimaryClerkEmail(user);
  if (!isRewardsAdminEmail(email)) return { error: NextResponse.json({ error: messages.forbidden || "Owner only" }, { status: 403 }) };
  return { client, user, userId, email };
}

export async function requireOwnerPageAccess(redirectUrl: string) {
  const { userId } = await auth();
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`);
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (!isRewardsAdminEmail(verifiedPrimaryClerkEmail(user))) notFound();
  return { client, user, userId };
}
