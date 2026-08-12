export function resolveGiftDeliveryMode(requestLive: boolean, env: NodeJS.ProcessEnv = process.env) {
  if (!requestLive) return "dry_run" as const;
  if (env.GIFT_EMAIL_DELIVERY_ENABLED === "0" || !env.RESEND_API_KEY?.trim()) return "blocked" as const;
  return "live" as const;
}
